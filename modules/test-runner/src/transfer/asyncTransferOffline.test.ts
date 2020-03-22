import {
  IConnextClient,
  RECEIVE_TRANSFER_FINISHED_EVENT,
  UPDATE_STATE_EVENT,
  LinkedTransferStatus,
} from "@connext/types";
import * as lolex from "lolex";

import {
  APP_PROTOCOL_TOO_LONG,
  asyncTransferAsset,
  createClient,
  createClientWithMessagingLimits,
  delay,
  expect,
  fundChannel,
  getMnemonic,
  getProtocolFromData,
  MessagingEventData,
  PROPOSE_INSTALL_SUPPORTED_APP_COUNT_RECEIVED,
  RECEIVED,
  REQUEST,
  requestCollateral,
  TestMessagingService,
  TOKEN_AMOUNT,
  TOKEN_AMOUNT_SM,
  getNatsClient,
} from "../util";
import { BigNumber } from "ethers/utils";
import { Client } from "ts-nats";
import { before } from "mocha";

const fundForTransfers = async (
  receiverClient: IConnextClient,
  senderClient: IConnextClient,
  amount: BigNumber = TOKEN_AMOUNT,
  assetId?: string,
): Promise<void> => {
  // make sure the tokenAddress is set
  const tokenAddress = senderClient.config.contractAddresses.Token;
  await fundChannel(senderClient, amount, assetId || tokenAddress);
  await requestCollateral(receiverClient, assetId || tokenAddress);
};

const verifyTransfer = async (
  client: IConnextClient,
  expected: any, //Partial<Transfer> type uses `null` not `undefined`
): Promise<void> => {
  expect(expected.paymentId).to.be.ok;
  console.log(`[test] fetching linked transfer`);
  const transfer = await client.getLinkedTransfer(expected.paymentId);
  console.log(`[test] got linked transfer!`);
  // verify the saved transfer information
  expect(transfer).to.containSubset(expected);
  expect(transfer.encryptedPreImage).to.be.ok;
};

describe("Async transfer offline tests", () => {
  let clock: any;
  let senderClient: IConnextClient;
  let receiverClient: IConnextClient;
  let nats: Client;

  before(async () => {
    nats = getNatsClient();
  });

  beforeEach(async () => {
    clock = lolex.install({
      shouldAdvanceTime: true,
      advanceTimeDelta: 1,
      now: Date.now(),
    });
  });

  afterEach(async () => {
    clock && clock.reset && clock.reset();
    await senderClient.messaging.disconnect();
    await receiverClient.messaging.disconnect();
  });

  /**
   * Should get timeout errors.
   *
   * Client calls `resolve` on node, node will install and propose, client
   * will take action with recipient.
   */
  it.skip("sender installs transfer successfully, receiver proposes install but node is offline", async () => {
    // create the sender client and receiver clients + fund
    senderClient = await createClientWithMessagingLimits();
    // 1 successful proposal (balance refund)
    receiverClient = await createClientWithMessagingLimits({
      ceiling: { received: PROPOSE_INSTALL_SUPPORTED_APP_COUNT_RECEIVED },
      protocol: "propose",
    });
    const tokenAddress = senderClient.config.contractAddresses.Token;
    await fundForTransfers(receiverClient, senderClient);
    (receiverClient.messaging as TestMessagingService).on(
      REQUEST,
      async (msg: MessagingEventData) => {
        const { subject } = msg;
        if (subject!.includes(`resolve`)) {
          // wait for message to be sent, event is fired first
          await delay(500);
          clock.tick(89_000);
        }
      },
    );
    // make the transfer call, should timeout in propose protocol
    await expect(
      asyncTransferAsset(senderClient, receiverClient, TOKEN_AMOUNT_SM, tokenAddress, nats),
    ).to.be.rejectedWith(`Failed to send message: Request timed out`);
  });

  /**
   * Should get timeout errors
   */
  it("sender installs transfer successfully, receiver installs successfully, but node is offline for take action (times out)", async () => {
    // create the sender client and receiver clients + fund
    senderClient = await createClientWithMessagingLimits();
    receiverClient = await createClientWithMessagingLimits({
      ceiling: { received: 0 },
      protocol: "takeAction",
    });
    const tokenAddress = senderClient.config.contractAddresses.Token;
    await fundForTransfers(receiverClient, senderClient);
    (receiverClient.messaging as TestMessagingService).on(
      RECEIVED,
      async (msg: MessagingEventData) => {
        if (getProtocolFromData(msg) === "takeAction") {
          clock.tick(89_000);
        }
      },
    );
    await expect(
      asyncTransferAsset(senderClient, receiverClient, TOKEN_AMOUNT_SM, tokenAddress, nats),
    ).to.be.rejectedWith(APP_PROTOCOL_TOO_LONG("takeAction"));
  });

  /**
   * Expected behavior: sender should still have app (with money owed to
   * them) installed in the channel when they come back online
   *
   * Ideally, the node takes action +  uninstalls these apps on `connect`,
   * and money is returned to the hubs channel (redeemed payment)
   */
  it("sender installs, receiver installs, takesAction, then uninstalls. Node tries to take action with sender but sender is offline but then comes online later (sender offline for take action)", async () => {
    // create the sender client and receiver clients + fund
    senderClient = await createClientWithMessagingLimits();
    receiverClient = await createClientWithMessagingLimits();
    const tokenAddress = senderClient.config.contractAddresses.Token;
    await fundForTransfers(receiverClient, senderClient);
    // transfer from the sender to the receiver, then take the
    // sender offline
    const received = new Promise(resolve =>
      receiverClient.once(RECEIVE_TRANSFER_FINISHED_EVENT, resolve),
    );
    const { paymentId } = await senderClient.transfer({
      amount: TOKEN_AMOUNT_SM.toString(),
      assetId: tokenAddress,
      recipient: receiverClient.publicIdentifier,
    });
    // immediately take sender offline
    await (senderClient.messaging as TestMessagingService).disconnect();
    // wait for transfer to finish
    await received;
    // // fast forward 3 min, so any protocols are expired for the client
    // clock.tick(60_000 * 3);
    // verify transfer
    const expected = {
      amount: TOKEN_AMOUNT_SM.toString(),
      receiverPublicIdentifier: receiverClient.publicIdentifier,
      paymentId,
      senderPublicIdentifier: senderClient.publicIdentifier,
      status: LinkedTransferStatus.REDEEMED,
      assetId: tokenAddress,
    };
    await verifyTransfer(receiverClient, expected);
    // reconnect the sender
    const reconnected = await createClient({
      mnemonic: getMnemonic(senderClient.publicIdentifier),
      store: senderClient.store,
    });
    // NOTE: fast forwarding does not propagate to node timers
    // so when `reconnected comes online, there is still a 90s
    // timer locked on the multisig address + appId (trying to
    // take action) and uninstall app (this is why this test has
    // an extended timeout)
    expect(reconnected.publicIdentifier).to.be.equal(senderClient.publicIdentifier);
    expect(reconnected.multisigAddress).to.be.equal(senderClient.multisigAddress);
    expect(reconnected.freeBalanceAddress).to.be.equal(senderClient.freeBalanceAddress);
    // make sure the transfer is properly reclaimed
    await verifyTransfer(reconnected, { ...expected, status: LinkedTransferStatus.UNLOCKED });
  });

  /**
   * Expected behavior: sender should still have app (with money owed to
   * them) installed in the channel when they come back online
   *
   * Ideally, the node takes action +  uninstalls these apps on `connect`,
   * and money is returned to the hubs channel (redeemed payment)
   */
  it.only("sender installs, receiver installs, takesAction, then uninstalls. Node takes action with sender then tries to uninstall, but sender is offline then comes online later (sender offline for uninstall)", async () => {
    // create the sender client and receiver clients + fund
    senderClient = await createClientWithMessagingLimits({
      ceiling: { sent: 1 }, // for deposit app
      protocol: "uninstall",
    });
    receiverClient = await createClientWithMessagingLimits();
    const tokenAddress = senderClient.config.contractAddresses.Token;
    await fundForTransfers(receiverClient, senderClient);
    console.log(`[test] receiver and sender funded!`);
    // transfer from the sender to the receiver, then take the
    // sender offline
    const received = new Promise((resolve: Function) =>
      receiverClient.once(RECEIVE_TRANSFER_FINISHED_EVENT, () => {
        console.log(`[test] received transfer finished event!`);
        resolve();
      }),
    );

    // disconnect messaging on take action event
    const actionTaken = new Promise((resolve: Function) => {
      senderClient.once(UPDATE_STATE_EVENT, async () => {
        console.log(`[test] caught action event!`);
        await received;
        await (senderClient.messaging as TestMessagingService).disconnect();
        console.log(`[test] disonnected sender messaging service!`);
        // fast forward 3 min so protocols are stale on client
        clock.tick(60_000 * 3);
        console.log(`[test] fast forwarded!`);
        resolve();
      });
    });
    const { paymentId } = await senderClient.transfer({
      amount: TOKEN_AMOUNT_SM.toString(),
      assetId: tokenAddress,
      recipient: receiverClient.publicIdentifier,
    });
    console.log(`[test] sent transfer!`);
    // wait for transfer to finish + messaging to be disconnected
    await actionTaken;
    // verify transfer
    const expected = {
      amount: TOKEN_AMOUNT_SM.toString(),
      receiverPublicIdentifier: receiverClient.publicIdentifier,
      paymentId,
      senderPublicIdentifier: senderClient.publicIdentifier,
      status: "REDEEMED",
      type: "LINKED",
    };
    console.log(`[test] verifying receiver transfer...`);
    await verifyTransfer(receiverClient, expected);
    console.log(`[test] verified receiver transfer!`);
    // reconnect the sender
    const reconnected = await createClient({
      mnemonic: getMnemonic(senderClient.publicIdentifier),
    });
    console.log(`[test] reconnected sender client!`);
    expect(reconnected.publicIdentifier).to.be.equal(senderClient.publicIdentifier);
    expect(reconnected.multisigAddress).to.be.equal(senderClient.multisigAddress);
    expect(reconnected.freeBalanceAddress).to.be.equal(senderClient.freeBalanceAddress);
    // make sure the transfer is properly reclaimed
    await verifyTransfer(reconnected, { ...expected, status: "UNLOCKED" });
    console.log(`[test] verified sender transfer!`);
  });
});
