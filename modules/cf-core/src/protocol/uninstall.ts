import { BaseProvider } from "ethers/providers";

import { SetStateCommitment } from "../ethereum";
import { xkeyKthAddress } from "../machine";
import { Commitment, Opcode, Protocol } from "../machine/enums";
import { Context, ProtocolExecutionFlow, ProtocolMessage, UninstallProtocolParams } from "../types";

import { computeTokenIndexedFreeBalanceIncrements } from "./utils/get-outcome-increments";
import { UNASSIGNED_SEQ_NO } from "./utils/signature-forwarder";
import { assertIsValidSignature } from "./utils/signature-validator";
import { Store } from "../store";

const protocol = Protocol.Uninstall;
const { OP_SIGN, IO_SEND, IO_SEND_AND_WAIT, PERSIST_STATE_CHANNEL, WRITE_COMMITMENT } = Opcode;
const { SetState } = Commitment;

/**
 * @description This exchange is described at the following URL:
 *
 * specs.counterfactual.com/06-uninstall-protocol#messages
 */
export const UNINSTALL_PROTOCOL: ProtocolExecutionFlow = {
  0 /* Initiating */: async function*(context: Context) {
    const { message, provider, store, network } = context;
    const { params, processID } = message;
    const { responderXpub, appIdentityHash } = params as UninstallProtocolParams;

    const responderAddress = xkeyKthAddress(responderXpub, 0);

    const postProtocolStateChannel = await computeStateTransition(
      params as UninstallProtocolParams,
      store,
      provider,
    );

    const uninstallCommitment = new SetStateCommitment(
      network.ChallengeRegistry,
      postProtocolStateChannel.freeBalance.identity,
      postProtocolStateChannel.freeBalance.hashOfLatestState,
      postProtocolStateChannel.freeBalance.versionNumber,
      postProtocolStateChannel.freeBalance.timeout,
    );

    const signature = yield [OP_SIGN, uninstallCommitment];

    const {
      customData: { signature: responderSignature },
    } = yield [
      IO_SEND_AND_WAIT,
      {
        protocol,
        processID,
        params,
        toXpub: responderXpub,
        customData: { signature },
        seq: 1,
      } as ProtocolMessage,
    ];

    assertIsValidSignature(responderAddress, uninstallCommitment, responderSignature);

    uninstallCommitment.signatures = [signature, responderSignature];

    yield [WRITE_COMMITMENT, SetState, uninstallCommitment, appIdentityHash];

    yield [PERSIST_STATE_CHANNEL, [postProtocolStateChannel]];
  },

  1 /* Responding */: async function*(context: Context) {
    const { message, provider, store, network } = context;
    const { params, processID } = message;
    const { initiatorXpub, appIdentityHash } = params as UninstallProtocolParams;

    const initiatorAddress = xkeyKthAddress(initiatorXpub, 0);

    const postProtocolStateChannel = await computeStateTransition(
      params as UninstallProtocolParams,
      store,
      provider,
    );

    const uninstallCommitment = new SetStateCommitment(
      network.ChallengeRegistry,
      postProtocolStateChannel.freeBalance.identity,
      postProtocolStateChannel.freeBalance.hashOfLatestState,
      postProtocolStateChannel.freeBalance.versionNumber,
      postProtocolStateChannel.freeBalance.timeout,
    );

    const initiatorSignature = context.message.customData.signature;

    assertIsValidSignature(initiatorAddress, uninstallCommitment, initiatorSignature);

    const responderSignature = yield [OP_SIGN, uninstallCommitment];

    uninstallCommitment.signatures = [responderSignature, initiatorSignature];

    yield [WRITE_COMMITMENT, SetState, uninstallCommitment, appIdentityHash];

    yield [PERSIST_STATE_CHANNEL, [postProtocolStateChannel]];

    yield [
      IO_SEND,
      {
        protocol,
        processID,
        toXpub: initiatorXpub,
        seq: UNASSIGNED_SEQ_NO,
        customData: {
          signature: responderSignature,
        },
      } as ProtocolMessage,
    ];
  },
};

async function computeStateTransition(
  params: UninstallProtocolParams,
  store: Store,
  provider: BaseProvider,
) {
  const { appIdentityHash, multisigAddress, blockNumberToUseIfNecessary } = params;
  const stateChannel = await store.getStateChannel(multisigAddress);
  return stateChannel.uninstallApp(
    appIdentityHash,
    await computeTokenIndexedFreeBalanceIncrements(
      stateChannel.getAppInstance(appIdentityHash),
      provider,
      undefined,
      blockNumberToUseIfNecessary,
    ),
  );
}
