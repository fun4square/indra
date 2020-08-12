import {
  getNatsClient,
  createClient,
  fundChannel,
  ETH_AMOUNT_SM,
  ETH_AMOUNT_MD,
  expect,
} from "../util";
import { Client } from "ts-nats";
import { IConnextClient, AppInstanceJson } from "@connext/types";
import { getRandomIdentifier } from "@connext/utils";

describe("Challenges", () => {
  let client: IConnextClient;
  let app: AppInstanceJson;
  const recipient = getRandomIdentifier();
  let nats: Client;

  before(async () => {
    nats = getNatsClient();
  });

  beforeEach(async () => {
    client = await createClient();
    await fundChannel(client, ETH_AMOUNT_MD);

    // install an app with some value in sender channel
    const res = await client.transfer({ amount: ETH_AMOUNT_SM, recipient });
    const { appInstance } = (await client.getAppInstance(res.appIdentityHash)) || {};
    app = appInstance!;
  });

  afterEach(async () => {
    await client.messaging.disconnect();
  });

  it("node should be able to initiate a dispute", async () => {});

  it("client should be able to initiate a dispute", async () => {
    const { appChallenge, freeBalanceChallenge } = await client.initiateChallenge({
      appIdentityHash: app.identityHash,
    });
    expect(appChallenge.hash).to.be.ok;
    expect(freeBalanceChallenge.hash).to.be.ok;
  });

  it("node and client should be able to cooperatively cancel a dispute", async () => {});

  it("channel should not operate when it is in dispute", async () => {});
});
