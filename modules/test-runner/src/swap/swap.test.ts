import { xkeyKthAddress } from "@connext/cf-core";
import { IConnextClient, SwapParameters } from "@connext/types";
import { AddressZero, One, Zero } from "ethers/constants";
import { BigNumber, bigNumberify, formatEther, parseEther } from "ethers/utils";

import { createClient } from "../util/client";

export const calculateExchange = (amount: BigNumber, swapRate: string): BigNumber => {
  return bigNumberify(formatEther(amount.mul(parseEther(swapRate))).replace(/\.[0-9]*$/, ""));
};

describe("Swaps", () => {
  let clientA: IConnextClient;
  let tokenAddress: string;
  let nodeFreeBalanceAddress: string;
  let nodePublicIdentifier: string;

  beforeEach(async () => {
    clientA = await createClient();

    tokenAddress = clientA.config.contractAddresses.Token;
    nodePublicIdentifier = clientA.config.nodePublicIdentifier;
    nodeFreeBalanceAddress = xkeyKthAddress(nodePublicIdentifier);
  }, 90_000);

  test("happy case: client swaps eth for tokens successfully", async () => {
    // client deposit and request node collateral
    await clientA.deposit({ amount: parseEther("0.01").toString(), assetId: AddressZero });
    await clientA.requestCollateral(tokenAddress);

    // check balances pre
    const {
      [clientA.freeBalanceAddress]: preSwapFreeBalanceEthClient,
      [nodeFreeBalanceAddress]: preSwapFreeBalanceEthNode,
    } = await clientA.getFreeBalance(AddressZero);
    expect(preSwapFreeBalanceEthClient).toBeBigNumberEq(parseEther("0.01"));
    expect(preSwapFreeBalanceEthNode).toBeBigNumberEq(Zero);

    const {
      [clientA.freeBalanceAddress]: preSwapFreeBalanceTokenClient,
      [nodeFreeBalanceAddress]: preSwapFreeBalanceTokenNode,
    } = await clientA.getFreeBalance(tokenAddress);
    expect(preSwapFreeBalanceTokenNode).toBeBigNumberEq(parseEther("10"));
    expect(preSwapFreeBalanceTokenClient).toBeBigNumberEq(Zero);

    const swapRate = await clientA.getLatestSwapRate(AddressZero, tokenAddress);

    const swapAmountEth = One;
    const swapParams: SwapParameters = {
      amount: swapAmountEth.toString(),
      fromAssetId: AddressZero,
      swapRate,
      toAssetId: tokenAddress,
    };
    await clientA.swap(swapParams);

    const {
      [clientA.freeBalanceAddress]: postSwapFreeBalanceEthClient,
      [nodeFreeBalanceAddress]: postSwapFreeBalanceEthNode,
    } = await clientA.getFreeBalance(AddressZero);
    const {
      [clientA.freeBalanceAddress]: postSwapFreeBalanceTokenClient,
      [nodeFreeBalanceAddress]: postSwapFreeBalanceTokenNode,
    } = await clientA.getFreeBalance(tokenAddress);

    expect(postSwapFreeBalanceEthClient).toBeBigNumberEq(
      preSwapFreeBalanceEthClient.sub(swapAmountEth),
    );
    expect(postSwapFreeBalanceEthNode).toBeBigNumberEq(swapAmountEth);

    const expectedTokenSwapAmount = calculateExchange(swapAmountEth, swapRate);
    expect(postSwapFreeBalanceTokenClient).toBeBigNumberEq(expectedTokenSwapAmount);
    expect(postSwapFreeBalanceTokenNode).toBeBigNumberEq(
      preSwapFreeBalanceTokenNode.sub(expectedTokenSwapAmount.toString()),
    );
  });
});
