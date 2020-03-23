import { xkeyKthAddress } from "@connext/cf-core";
<<<<<<< HEAD
import { EventNames, IConnextClient, toBN } from "@connext/types";
import { AddressZero, One, Two } from "ethers/constants";
import { bigNumberify, hexlify, randomBytes } from "ethers/utils";
import { before, describe, after } from "mocha";
=======
import { IConnextClient, UPDATE_STATE_EVENT } from "@connext/types";
import { AddressZero, One, Two } from "ethers/constants";
import { bigNumberify, hexlify, randomBytes } from "ethers/utils";
import { before, describe } from "mocha";
>>>>>>> nats-messaging-refactor
import { Client } from "ts-nats";

import { createClient, fundChannel, asyncTransferAsset, expect } from "../util";
import { addRebalanceProfile } from "../util/helpers/rebalanceProfile";
import { getNatsClient } from "../util/nats";

describe("Reclaim", () => {
  let clientA: IConnextClient;
  let clientB: IConnextClient;
  let tokenAddress: string;
  let nodeFreeBalanceAddress: string;
  let nats: Client;

  before(async () => {
    nats = getNatsClient();
  });

  beforeEach(async () => {
    clientA = await createClient();
    clientB = await createClient();
    tokenAddress = clientA.config.contractAddresses.Token;
    nodeFreeBalanceAddress = xkeyKthAddress(clientA.config.nodePublicIdentifier);
  });

  afterEach(async () => {
    await clientA.messaging.disconnect();
    await clientB.messaging.disconnect();
  });

  it("happy case: node should reclaim ETH with async transfer", async () => {
    const REBALANCE_PROFILE = {
      assetId: AddressZero,
      lowerBoundCollateralize: toBN("5"),
      upperBoundCollateralize: toBN("10"),
      lowerBoundReclaim: toBN("20"),
      upperBoundReclaim: toBN("30"),
    };

    // set rebalancing profile to reclaim collateral
    await addRebalanceProfile(nats, clientA, REBALANCE_PROFILE);

    // deposit client
    await fundChannel(
      clientA,
      bigNumberify(REBALANCE_PROFILE.upperBoundReclaim).add(Two),
      AddressZero,
    );
    await clientB.requestCollateral(AddressZero);

    // transfer to node to get node over upper bound reclaim
    // first transfer gets to upper bound
    await asyncTransferAsset(
      clientA,
      clientB,
      bigNumberify(REBALANCE_PROFILE.upperBoundReclaim).add(One),
      AddressZero,
      nats,
    );
    // second transfer triggers reclaim
    // verify that node reclaims until lower bound reclaim
    await new Promise(async res => {
      const paymentId = hexlify(randomBytes(32));
<<<<<<< HEAD
      clientA.on(EventNames.UPDATE_STATE_EVENT, async(data) => {
        if(data.newState.data) {
=======
      clientA.on(UPDATE_STATE_EVENT, async data => {
        if (data.newState.data) {
>>>>>>> nats-messaging-refactor
          res();
        }
      });
      await clientA.transfer({
        amount: One.toString(),
        assetId: AddressZero,
        recipient: clientB.publicIdentifier,
        paymentId,
      });
    });

    const freeBalancePost = await clientA.getFreeBalance(AddressZero);
<<<<<<< HEAD
    // expect this could be checked pre or post the rest of the transfer
    // so try to pre-emptively avoid race conditions
    expect(freeBalancePost[nodeFreeBalanceAddress].gte(
      bigNumberify(REBALANCE_PROFILE.lowerBoundReclaim),
    )).to.be.true;
    expect(freeBalancePost[nodeFreeBalanceAddress].lte(
      bigNumberify(REBALANCE_PROFILE.lowerBoundReclaim).add(One),
    )).to.be.true;
=======
    // expect this could be checked pre or post the rest of the transfer, so try to pre-emptively avoid race conditions
    expect(
      freeBalancePost[nodeFreeBalanceAddress].gte(
        bigNumberify(REBALANCE_PROFILE.lowerBoundReclaim),
      ),
    ).to.be.true;
    expect(
      freeBalancePost[nodeFreeBalanceAddress].lte(
        bigNumberify(REBALANCE_PROFILE.lowerBoundReclaim).add(One),
      ),
    ).to.be.true;
>>>>>>> nats-messaging-refactor
  });

  it("happy case: node should reclaim tokens after async transfer", async () => {
    const REBALANCE_PROFILE = {
      assetId: tokenAddress,
      lowerBoundCollateralize: toBN("5"),
      upperBoundCollateralize: toBN("10"),
      lowerBoundReclaim: toBN("20"),
      upperBoundReclaim: toBN("30"),
    };

    // set rebalancing profile to reclaim collateral
    await addRebalanceProfile(nats, clientA, REBALANCE_PROFILE);

    // deposit client
    await fundChannel(
      clientA,
      bigNumberify(REBALANCE_PROFILE.upperBoundReclaim).add(Two),
      tokenAddress,
    );
    await clientB.requestCollateral(AddressZero);

    // transfer to node to get node over upper bound reclaim
    // first transfer gets to upper bound
    await asyncTransferAsset(
      clientA,
      clientB,
      bigNumberify(REBALANCE_PROFILE.upperBoundReclaim).add(One),
      tokenAddress,
      nats,
    );
    // second transfer triggers reclaim
    // verify that node reclaims until lower bound reclaim
    await new Promise(async res => {
      const paymentId = hexlify(randomBytes(32));
<<<<<<< HEAD
      clientA.on(EventNames.UPDATE_STATE_EVENT, async(data) => {
        if(data.newState.data) {
=======
      clientA.on(UPDATE_STATE_EVENT, async data => {
        if (data.newState.data) {
>>>>>>> nats-messaging-refactor
          res();
        }
      });
      await clientA.transfer({
        amount: One.toString(),
        assetId: tokenAddress,
        recipient: clientB.publicIdentifier,
        paymentId,
      });
    });

    const freeBalancePost = await clientA.getFreeBalance(tokenAddress);
<<<<<<< HEAD
    // expect this could be checked pre or post the rest of the transfer
    // so try to pre-emptively avoid race conditions
    expect(freeBalancePost[nodeFreeBalanceAddress].gte(
      bigNumberify(REBALANCE_PROFILE.lowerBoundReclaim),
    )).to.be.true;
    expect(freeBalancePost[nodeFreeBalanceAddress].lte(
      bigNumberify(REBALANCE_PROFILE.lowerBoundReclaim).add(One),
    )).to.be.true;
=======
    // expect this could be checked pre or post the rest of the transfer, so try to pre-emptively avoid race conditions
    expect(
      freeBalancePost[nodeFreeBalanceAddress].gte(
        bigNumberify(REBALANCE_PROFILE.lowerBoundReclaim),
      ),
    ).to.be.true;
    expect(
      freeBalancePost[nodeFreeBalanceAddress].lte(
        bigNumberify(REBALANCE_PROFILE.lowerBoundReclaim).add(One),
      ),
    ).to.be.true;
>>>>>>> nats-messaging-refactor
  });

  it.skip("happy case: node should reclaim ETH after linked transfer", async () => {});

  it.skip("happy case: node should reclaim tokens after linked transfer", async () => {});

});
