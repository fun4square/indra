import { SupportedApplications } from "@connext/apps";
import { MessagingService } from "@connext/messaging";
import {
  Address,
  AppAction,
  AppInstanceJson,
  AppInstanceProposal,
  AppRegistry,
  AppState,
  ChannelMethods,
  ChannelProviderConfig,
  ConditionalTransferTypes,
  ConnextClientStorePrefix,
  createRandom32ByteHexString,
  DefaultApp,
  DepositAppName,
  DepositAppState,
  EventNames,
  IChannelProvider,
  IClientStore,
  IConnextClient,
  ILoggerService,
  INodeApiClient,
  MethodNames,
  MethodParams,
  MethodResults,
  MinimalTransaction,
  NodeResponses,
  PublicParams,
  PublicResults,
  RebalanceProfile,
  SimpleLinkedTransferAppName,
  SimpleTwoPartySwapAppName,
  WithdrawAppName,
} from "@connext/types";
import { decryptWithPrivateKey } from "@connext/crypto";
import { Contract, providers, Signer } from "ethers";
import { AddressZero } from "ethers/constants";
import { TransactionResponse } from "ethers/providers";
import { BigNumber, bigNumberify, getAddress, Network, Transaction } from "ethers/utils";
import tokenAbi from "human-standard-token-abi";

import { createCFChannelProvider } from "./channelProvider";
import {
  DepositController,
  HashLockTransferController,
  LinkedTransferController,
  ResolveHashLockTransferController,
  ResolveLinkedTransferController,
  ResolveSignedTransferController,
  SignedTransferController,
  SwapController,
  WithdrawalController,
} from "./controllers";
import { stringify, withdrawalKey } from "./lib";
import { ConnextListener } from "./listener";
import { InternalClientOptions } from "./types";

export class ConnextClient implements IConnextClient {
  public appRegistry: AppRegistry;
  public channelProvider: IChannelProvider;
  public config: NodeResponses.GetConfig;
  public ethProvider: providers.JsonRpcProvider;
  public signerAddress: string;
  public listener: ConnextListener;
  public log: ILoggerService;
  public messaging: MessagingService;
  public multisigAddress: Address;
  public network: Network;
  public node: INodeApiClient;
  public nodePublicIdentifier: string;
  public nodeSignerAddress: string;
  public publicIdentifier: string;
  public store: IClientStore;
  public token: Contract;

  private opts: InternalClientOptions;
  private signer: Signer;

  private depositController: DepositController;
  private swapController: SwapController;
  private withdrawalController: WithdrawalController;
  private linkedTransferController: LinkedTransferController;
  private resolveLinkedTransferController: ResolveLinkedTransferController;
  private hashlockTransferController: HashLockTransferController;
  private resolveHashLockTransferController: ResolveHashLockTransferController;
  private signedTransferController: SignedTransferController;
  private resolveSignedTransferController: ResolveSignedTransferController;

  constructor(opts: InternalClientOptions) {
    this.opts = opts;
    this.appRegistry = opts.appRegistry;
    this.channelProvider = opts.channelProvider;
    this.config = opts.config;
    this.ethProvider = opts.ethProvider;
    this.signer = opts.signer;
    this.log = opts.logger.newContext("ConnextClient");
    this.messaging = opts.messaging;
    this.network = opts.network;
    this.node = opts.node;
    this.store = opts.store;
    this.token = opts.token;

    this.signerAddress = this.channelProvider.config.signerAddress;
    this.publicIdentifier = this.channelProvider.config.userPublicIdentifier;
    this.multisigAddress = this.channelProvider.config.multisigAddress;
    this.nodePublicIdentifier = this.opts.config.nodePublicIdentifier;
    this.nodeSignerAddress = this.nodePublicIdentifier;

    // establish listeners
    this.listener = new ConnextListener(opts.channelProvider, this);

    // instantiate controllers with log and cf
    this.depositController = new DepositController("DepositController", this);
    this.swapController = new SwapController("SwapController", this);
    this.withdrawalController = new WithdrawalController("WithdrawalController", this);
    this.linkedTransferController = new LinkedTransferController("LinkedTransferController", this);
    this.resolveLinkedTransferController = new ResolveLinkedTransferController(
      "ResolveLinkedTransferController",
      this,
    );
    this.hashlockTransferController = new HashLockTransferController(
      "HashLockTransferController",
      this,
    );
    this.resolveHashLockTransferController = new ResolveHashLockTransferController(
      "ResolveHashLockTransferController",
      this,
    );
    this.signedTransferController = new SignedTransferController("SignedTransferController", this);
    this.resolveSignedTransferController = new ResolveSignedTransferController(
      "ResolveSignedTransferController",
      this,
    );
  }

  /**
   * Creates a promise that returns when the channel is available,
   * ie. when the setup protocol or create channel call is completed
   */
  public isAvailable = async (): Promise<void> => {
    return new Promise(
      async (resolve: any, reject: any): Promise<any> => {
        // Wait for channel to be available
        const channelIsAvailable = async (): Promise<boolean> => {
          const chan = await this.node.getChannel();
          return chan && chan.available;
        };
        while (!(await channelIsAvailable())) {
          await new Promise((res: any): any => setTimeout((): void => res(), 100));
        }
        resolve();
      },
    );
  };

  // register subscriptions
  public registerSubscriptions = async (): Promise<void> => {
    await this.listener.register();
  };

  ///////////////////////////////////
  // Unsorted methods pulled from the old abstract wrapper class

  public restart = async (): Promise<void> => {
    if (!this.channelProvider.isSigner) {
      this.log.warn("Cannot restart with an injected provider.");
      return;
    }

    // ensure that node and user address are different
    if (this.nodePublicIdentifier === this.publicIdentifier) {
      throw new Error(
        "Client must be instantiated with a secret that is different from the node's secret",
      );
    }

    // Create a fresh channelProvider & start using that.
    // End goal is to use this to restart the cfNode after restoring state
    const channelProvider = await createCFChannelProvider({
      ethProvider: this.ethProvider,
      signer: this.signer,
      lockService: { acquireLock: this.node.acquireLock.bind(this.node) },
      messaging: this.messaging as any,
      contractAddresses: this.config.contractAddresses,
      nodeConfig: { STORE_KEY_PREFIX: ConnextClientStorePrefix },
      nodeUrl: this.channelProvider.config.nodeUrl,
      publicIdentifier: await this.signer.getAddress(),
      store: this.store,
      logger: this.log.newContext("CFChannelProvider"),
    });
    // TODO: this is very confusing to have to do, lets try to figure out a better way
    channelProvider.multisigAddress = this.multisigAddress;
    this.node.channelProvider = channelProvider;
    this.channelProvider = channelProvider;
    this.listener = new ConnextListener(channelProvider, this);
    await this.isAvailable();
  };

  public getChannel = async (): Promise<NodeResponses.GetChannel> => {
    return await this.node.getChannel();
  };

  public requestCollateral = async (
    tokenAddress: string,
  ): Promise<NodeResponses.RequestCollateral | void> => {
    const res = await this.node.requestCollateral(tokenAddress);
    return res;
  };

  public channelProviderConfig = async (): Promise<ChannelProviderConfig> => {
    return this.channelProvider.config;
  };

  public getLinkedTransfer = async (
    paymentId: string,
  ): Promise<NodeResponses.GetLinkedTransfer> => {
    return await this.node.fetchLinkedTransfer(paymentId);
  };

  public getSignedTransfer = async (
    paymentId: string,
  ): Promise<NodeResponses.GetSignedTransfer> => {
    return await this.node.fetchSignedTransfer(paymentId);
  };

  public getAppRegistry = async (
    appDetails?:
      | {
          name: SupportedApplications;
          chainId: number;
        }
      | { appDefinitionAddress: string },
  ): Promise<AppRegistry | DefaultApp | undefined> => {
    if (!this.appRegistry) {
      this.appRegistry = await this.node.appRegistry();
    }
    const registry = this.appRegistry;
    if (!appDetails) {
      return registry;
    }
    const { name, chainId, appDefinitionAddress } = appDetails as any;
    if (name) {
      return registry.find(app => 
        app.name === name &&
        app.chainId === chainId,
      );
    }
    return registry.find(app =>
      app.appDefinitionAddress === appDefinitionAddress,
    );
  };

  public createChannel = async (): Promise<NodeResponses.CreateChannel> => {
    return this.node.createChannel();
  };

  public subscribeToSwapRates = async (from: string, to: string, callback: any): Promise<any> => {
    return await this.node.subscribeToSwapRates(from, to, callback);
  };

  public getLatestSwapRate = async (from: string, to: string): Promise<string> => {
    return await this.node.getLatestSwapRate(from, to);
  };

  public unsubscribeToSwapRates = async (from: string, to: string): Promise<void> => {
    return this.node.unsubscribeFromSwapRates(from, to);
  };

  public getRebalanceProfile = async (assetId?: string): Promise<RebalanceProfile | undefined> => {
    return await this.node.getRebalanceProfile(assetId);
  };

  public getTransferHistory = async (): Promise<NodeResponses.GetTransferHistory> => {
    return await this.node.getTransferHistory();
  };

  ///////////////////////////////////
  // CORE CHANNEL METHODS

  public deposit = async (params: PublicParams.Deposit): Promise<PublicResults.Deposit> => {
    return this.depositController.deposit(params);
  };

  public requestDepositRights = async (
    params: PublicParams.RequestDepositRights,
  ): Promise<MethodResults.RequestDepositRights> => {
    return this.depositController.requestDepositRights(params);
  };

  public rescindDepositRights = async (
    params: PublicParams.RescindDepositRights,
  ): Promise<PublicResults.RescindDepositRights> => {
    return this.depositController.rescindDepositRights(params);
  };

  public checkDepositRights = async (
    params: PublicParams.CheckDepositRights,
  ): Promise<PublicResults.CheckDepositRights> => {
    const app = await this.depositController.getDepositApp(params);
    if (!app) {
      return { appIdentityHash: undefined };
    }
    return { appIdentityHash: app.identityHash };
  };

  public swap = async (params: PublicParams.Swap): Promise<PublicResults.Swap> => {
    const res = await this.swapController.swap(params);
    return res;
  };

  /**
   * Transfer currently uses the conditionalTransfer LinkedTransfer so that
   * async payments are the default transfer.
   */
  public transfer = async (
    params: PublicParams.Transfer,
  ): Promise<PublicResults.LinkedTransfer> => {
    return this.linkedTransferController.linkedTransfer({
      amount: params.amount,
      assetId: params.assetId || AddressZero,
      conditionType: ConditionalTransferTypes.LinkedTransfer,
      meta: params.meta,
      paymentId: params.paymentId || createRandom32ByteHexString(),
      preImage: createRandom32ByteHexString(),
      recipient: params.recipient,
    }) as Promise<PublicResults.LinkedTransfer>;
  };

  public withdraw = async (params: PublicParams.Withdraw): Promise<PublicResults.Withdraw> => {
    return await this.withdrawalController.withdraw(params);
  };

  public respondToNodeWithdraw = async (appInstance: AppInstanceJson): Promise<void> => {
    return await this.withdrawalController.respondToNodeWithdraw(appInstance);
  };

  public saveWithdrawCommitmentToStore = async (
    params: PublicParams.Withdraw,
    signatures: string[],
  ): Promise<void> => {
    return await this.withdrawalController.saveWithdrawCommitmentToStore(
      params,
      signatures,
    );
  };

  public resolveCondition = async (
    params: PublicParams.ResolveCondition,
  ): Promise<PublicResults.ResolveCondition> => {
    switch (params.conditionType) {
      case ConditionalTransferTypes.LinkedTransfer: {
        return this.resolveLinkedTransferController.resolveLinkedTransfer(params);
      }
      case ConditionalTransferTypes.HashLockTransfer: {
        return this.resolveHashLockTransferController.resolveHashLockTransfer(params);
      }
      case ConditionalTransferTypes.SignedTransfer: {
        return this.resolveSignedTransferController.resolveSignedTransfer(params);
      }
      default:
        throw new Error(`Condition type ${(params as any).conditionType} invalid`);
    }
  };

  public conditionalTransfer = async (
    params: PublicParams.ConditionalTransfer,
  ): Promise<PublicResults.ConditionalTransfer> => {
    switch (params.conditionType) {
      case ConditionalTransferTypes.LinkedTransfer: {
        return this.linkedTransferController.linkedTransfer(params);
      }
      case ConditionalTransferTypes.HashLockTransfer: {
        return this.hashlockTransferController.hashLockTransfer(params);
      }
      case ConditionalTransferTypes.SignedTransfer: {
        return this.signedTransferController.signedTransfer(params);
      }
      default:
        throw new Error(`Condition type ${(params as any).conditionType} invalid`);
    }
  };

  public getHashLockTransfer = async (
    lockHash: string,
  ): Promise<NodeResponses.GetHashLockTransfer> => {
    return await this.node.getHashLockTransfer(lockHash);
  };

  public getLatestWithdrawal = async (): Promise<
    { retry: number; tx: MinimalTransaction } | undefined
  > => {
    const value = await this.channelProvider.send(ChannelMethods.chan_getUserWithdrawal, {});

    if (!value || typeof value === "undefined") {
      return undefined;
    }

    const noRetry = typeof value.retry === "undefined" || value.retry === null;
    if (!value.tx || noRetry) {
      const msg = `Can not find tx or retry in store under key ${withdrawalKey(
        this.publicIdentifier,
      )}`;
      this.log.error(msg);
      throw new Error(msg);
    }
    return value;
  };

  public watchForUserWithdrawal = async (): Promise<TransactionResponse | undefined> => {
    // poll for withdrawal tx submitted to multisig matching tx data
    const maxBlocks = 15;
    const startingBlock = await this.ethProvider.getBlockNumber();
    let transaction: TransactionResponse;

    // TODO: poller should not be completely blocking, but safe to leave for now
    // because the channel should be blocked
    try {
      transaction = await new Promise((resolve: any, reject: any): any => {
        this.ethProvider.on(
          "block",
          async (blockNumber: number): Promise<void> => {
            const transaction = await this.checkForUserWithdrawal(blockNumber);
            if (transaction) {
              await this.channelProvider.send(ChannelMethods.chan_setUserWithdrawal, {
                withdrawalObject: undefined,
              });
              this.ethProvider.removeAllListeners("block");
              resolve(transaction);
            }
            if (blockNumber - startingBlock >= maxBlocks) {
              this.ethProvider.removeAllListeners("block");
              reject(`More than ${maxBlocks} have passed: ${blockNumber - startingBlock}`);
            }
          },
        );
      });
    } catch (e) {
      // if (e.includes(`More than ${maxBlocks} have passed`)) {
      //   this.log.debug("Retrying node submission");
      //   await this.retryNodeSubmittedWithdrawal();
      // }
      throw new Error(`Error watching for user withdrawal: ${e}`);
    }
    return transaction;
  };

  ////////////////////////////////////////
  // Restore State

  public restoreState = async (): Promise<void> => {
    try {
      await this.channelProvider.send(ChannelMethods.chan_restoreState, {});
      this.log.info(`Found state to restore from store's backup`);
    } catch (e) {
      const { 
        channel,
        setupCommitment,
        setStateCommitments,
        conditionalCommitments,
      } = await this.node.restoreState(this.publicIdentifier);
      if (!channel) {
        throw new Error(`No matching states found by node for ${this.publicIdentifier}`);
      }
      this.log.debug(`Found state to restore from node`);
      this.log.debug(`Restored channel: ${stringify(channel)}`);
      await this.channelProvider.send(ChannelMethods.chan_setStateChannel, {
        state: channel,
      });
      this.log.debug(`Restoring setup: ${stringify(setupCommitment)}`);
      await this.channelProvider.send(ChannelMethods.chan_createSetupCommitment, {
        multisigAddress: channel.multisigAddress,
        commitment: setupCommitment,
      });
      this.log.debug(`Restoring ${setStateCommitments.length} set state commitments`);
      for (const [appIdentityHash, commitment] of setStateCommitments) {
        await this.channelProvider.send(ChannelMethods.chan_createSetStateCommitment, {
          appIdentityHash,
          commitment,
        });
      }

      this.log.debug(`Restoring ${conditionalCommitments.length} conditional commitments`);
      for (const [appIdentityHash, commitment] of conditionalCommitments) {
        await this.channelProvider.send(ChannelMethods.chan_createConditionalCommitment, {
          appIdentityHash,
          commitment,
        });
      }
    }
    await this.restart();
  };

  ///////////////////////////////////
  // EVENT METHODS

  public on = (event: EventNames, callback: (...args: any[]) => void): ConnextListener => {
    return this.listener.on(event, callback);
  };

  public once = (event: EventNames, callback: (...args: any[]) => void): ConnextListener => {
    return this.listener.once(event, callback);
  };

  public emit = (event: EventNames, data: any): boolean => {
    return this.listener.emit(event, data);
  };

  public removeListener = (
    event: EventNames,
    callback: (...args: any[]) => void,
  ): ConnextListener => {
    return this.listener.removeListener(event, callback);
  };

  ///////////////////////////////////
  // PROVIDER/ROUTER METHODS

  public deployMultisig = async (): Promise<MethodResults.DeployStateDepositHolder> => {
    return await this.channelProvider.send(MethodNames.chan_deployStateDepositHolder, {
      multisigAddress: this.multisigAddress,
    });
  };

  public getStateChannel = async (): Promise<MethodResults.GetStateChannel> => {
    return await this.channelProvider.send(MethodNames.chan_getStateChannel, {
      multisigAddress: this.multisigAddress,
    });
  };

  public getAppInstances = async (): Promise<AppInstanceJson[]> => {
    const { appInstances } = await this.channelProvider.send(MethodNames.chan_getAppInstances, {
      multisigAddress: this.multisigAddress,
    } as MethodParams.GetAppInstances);
    return appInstances;
  };

  public getFreeBalance = async (
    assetId: string = AddressZero,
  ): Promise<MethodResults.GetFreeBalanceState> => {
    if (typeof assetId !== "string") {
      throw new Error(`Asset id must be a string: ${stringify(assetId)}`);
    }
    const normalizedAssetId = getAddress(assetId);
    try {
      return await this.channelProvider.send(MethodNames.chan_getFreeBalanceState, {
        multisigAddress: this.multisigAddress,
        tokenAddress: getAddress(assetId),
      } as MethodParams.GetFreeBalanceState);
    } catch (e) {
      const error = `No free balance exists for the specified token: ${normalizedAssetId}`;
      if (e.message.includes(error)) {
        // if there is no balance, return undefined
        // NOTE: can return free balance obj with 0s,
        // but need the nodes free balance
        // address in the multisig
        const obj = {};
        obj[this.nodeSignerAddress] = new BigNumber(0);
        obj[this.signerAddress] = new BigNumber(0);
        return obj;
      }
      throw e;
    }
  };

  public getProposedAppInstances = async (
    multisigAddress?: string,
  ): Promise<MethodResults.GetProposedAppInstances | undefined> => {
    return await this.channelProvider.send(MethodNames.chan_getProposedAppInstances, {
      multisigAddress: multisigAddress || this.multisigAddress,
    } as MethodParams.GetProposedAppInstances);
  };

  public getProposedAppInstance = async (
    appIdentityHash: string,
  ): Promise<MethodResults.GetProposedAppInstance | undefined> => {
    return await this.channelProvider.send(MethodNames.chan_getProposedAppInstance, {
      appIdentityHash,
    } as MethodParams.GetProposedAppInstance);
  };

  public getAppInstance = async (
    appIdentityHash: string,
  ): Promise<MethodResults.GetAppInstanceDetails | undefined> => {
    const err = await this.appNotInstalled(appIdentityHash);
    if (err) {
      this.log.warn(err);
      return undefined;
    }
    return await this.channelProvider.send(MethodNames.chan_getAppInstance, {
      appIdentityHash,
    } as MethodParams.GetAppInstanceDetails);
  };

  public takeAction = async (
    appIdentityHash: string,
    action: AppAction,
    stateTimeout?: BigNumber,
  ): Promise<MethodResults.TakeAction> => {
    // check the app is actually installed
    const err = await this.appNotInstalled(appIdentityHash);
    if (err) {
      this.log.error(err);
      throw new Error(err);
    }
    // check state is not finalized
    const { latestState: state } = (await this.getAppInstance(appIdentityHash)).appInstance;
    if ((state as any).finalized) { // FIXME: casting?
      throw new Error("Cannot take action on an app with a finalized state.");
    }
    return await this.channelProvider.send(MethodNames.chan_takeAction, {
      action,
      appIdentityHash,
      stateTimeout,
    } as MethodParams.TakeAction);
  };

  public updateState = async (
    appIdentityHash: string,
    newState: AppState | any, // cast to any bc no supported apps use
    // the update state method
  ): Promise<MethodResults.UpdateState> => {
    // check the app is actually installed
    const err = await this.appNotInstalled(appIdentityHash);
    if (err) {
      this.log.error(err);
      throw new Error(err);
    }
    // check state is not finalized
    const { latestState: state } = (await this.getAppInstance(appIdentityHash)).appInstance;
    if ((state as any).finalized) { // FIXME: casting?
      throw new Error("Cannot take action on an app with a finalized state.");
    }
    return await this.channelProvider.send(MethodNames.chan_updateState, {
      appIdentityHash,
      newState,
    } as MethodParams.UpdateState);
  };

  public proposeInstallApp = async (
    params: MethodParams.ProposeInstall,
  ): Promise<MethodResults.ProposeInstall> => {
    return await this.channelProvider.send(
      MethodNames.chan_proposeInstall,
      params as MethodParams.ProposeInstall,
    );
  };

  public installApp = async (appIdentityHash: string): Promise<MethodResults.Install> => {
    // check the app isnt actually installed
    const alreadyInstalled = await this.appInstalled(appIdentityHash);
    if (alreadyInstalled) {
      throw new Error(alreadyInstalled);
    }
    return await this.channelProvider.send(MethodNames.chan_install, {
      appIdentityHash,
    } as MethodParams.Install);
  };

  public uninstallApp = async (appIdentityHash: string): Promise<MethodResults.Uninstall> => {
    // check the app is actually installed
    const err = await this.appNotInstalled(appIdentityHash);
    if (err) {
      this.log.error(err);
      throw new Error(err);
    }
    return await this.channelProvider.send(MethodNames.chan_uninstall, {
      appIdentityHash,
    } as MethodParams.Uninstall);
  };

  public rejectInstallApp = async (appIdentityHash: string): Promise<MethodResults.Uninstall> => {
    return await this.channelProvider.send(MethodNames.chan_rejectInstall, {
      appIdentityHash,
    });
  };

  ///////////////////////////////////
  // NODE METHODS

  public clientCheckIn = async (): Promise<void> => {
    return await this.node.clientCheckIn();
  };

  public reclaimPendingAsyncTransfers = async (): Promise<void> => {
    const pendingTransfers = await this.node.getPendingAsyncTransfers();
    for (const transfer of pendingTransfers) {
      const { encryptedPreImage, paymentId } = transfer;
      await this.reclaimPendingAsyncTransfer(paymentId, encryptedPreImage);
    }
  };

  public reclaimPendingAsyncTransfer = async (
    paymentId: string,
    encryptedPreImage: string,
  ): Promise<PublicResults.ResolveLinkedTransfer> => {
    this.log.info(`Reclaiming transfer ${paymentId}`);
    // decrypt secret and resolve
    let privateKey = await (this.signer as any).privateKey; // TODO: this won't work
    const preImage = await decryptWithPrivateKey(privateKey, encryptedPreImage);
    this.log.debug(`Decrypted message and recovered preImage: ${preImage}`);
    const response = await this.resolveLinkedTransferController.resolveLinkedTransfer({
      conditionType: ConditionalTransferTypes.LinkedTransfer,
      paymentId,
      preImage,
    });
    this.log.info(`Reclaimed transfer ${paymentId}`);
    return response;
  };

  ///////////////////////////////////
  // LOW LEVEL METHODS

  public getRegisteredAppDetails = (appName: SupportedApplications): DefaultApp => {
    const appInfo = this.appRegistry.filter((app: DefaultApp): boolean => {
      return app.name === appName && app.chainId === this.network.chainId;
    });

    if (!appInfo || appInfo.length === 0) {
      throw new Error(`Could not find ${appName} app details on chain ${this.network.chainId}`);
    }

    if (appInfo.length > 1) {
      throw new Error(`Found multiple ${appName} app details on chain ${this.network.chainId}`);
    }
    return appInfo[0];
  };

  public matchTx = (
    givenTransaction: Transaction | undefined,
    expected: MinimalTransaction,
  ): boolean => {
    return (
      givenTransaction &&
      givenTransaction.to === expected.to &&
      bigNumberify(givenTransaction.value).eq(expected.value) &&
      givenTransaction.data === expected.data
    );
  };

  /**
   * NOTE: this function should *only* be called on `connect()`, and is
   * designed to cleanup channel state in the event of the client going
   * offline and not completing protocols.
   *
   * This function will *only* handle registered applications, or applications
   * who's desired functionality is well understood. The apps will be handled
   * as follows:
   * - proposed swaps: install will be rejected, removing them from the proposed
   *   app instances and preventing stale swaps from being installed.
   * - installed swaps: will be automatically uninstalled, thereby executing the
   *   swap as soon as the client is able.
   * - proposed linked transfer apps: reject install
   * - installed linked transfer: leave installed for the hub to uninstall
   */
  public cleanupRegistryApps = async (): Promise<void> => {
    const swapAppRegistryInfo = this.appRegistry.filter(
      (app: DefaultApp) => app.name === SimpleTwoPartySwapAppName,
    )[0];
    const linkedRegistryInfo = this.appRegistry.filter(
      (app: DefaultApp) => app.name === SimpleLinkedTransferAppName,
    )[0];
    const withdrawRegistryInfo = this.appRegistry.filter(
      (app: DefaultApp) => app.name === WithdrawAppName,
    )[0];
    const depositRegistryInfo = this.appRegistry.filter(
      (app: DefaultApp) => app.name === DepositAppName,
    )[0];

    await this.removeHangingProposalsByDefinition([
      swapAppRegistryInfo.appDefinitionAddress,
      linkedRegistryInfo.appDefinitionAddress,
      withdrawRegistryInfo.appDefinitionAddress,
      depositRegistryInfo.appDefinitionAddress,
    ]);

    // deal with any apps that are installed and can simply
    // be uninstalled
    await this.uninstallAllAppsByDefintion([
      swapAppRegistryInfo.appDefinitionAddress,
      withdrawRegistryInfo.appDefinitionAddress,
    ]);

    // handle any existing apps
    await this.handleInstalledDepositApps();
  };

  /**
   * Removes all proposals of a give app definition type
   */
  private removeHangingProposalsByDefinition = async (appDefinitions: string[]): Promise<void> => {
    // first get all proposed apps
    const { appInstances: proposed } = await this.getProposedAppInstances();

    // deal with any proposed swap or linked transfer apps
    const hangingProposals = proposed.filter((proposal: AppInstanceProposal) =>
      appDefinitions.includes(proposal.appDefinition),
    );
    // remove from `proposedAppInstances`
    for (const hanging of hangingProposals) {
      try {
        await this.rejectInstallApp(hanging.identityHash);
      } catch (e) {
        this.log.error(`Could not remove proposal: ${hanging.identityHash}. Error: ${e.stack || e.message}`);
      }
    }
  };

  /**
   * Removes all apps of a given app definition type
   */
  private uninstallAllAppsByDefintion = async (appDefinitions: string[]): Promise<void> => {
    const apps = (await this.getAppInstances()).filter((app: AppInstanceJson) =>
      appDefinitions.includes(app.appInterface.addr),
    );
    // TODO: ARJUN there is an edgecase where this will cancel withdrawal
    for (const app of apps) {
      try {
        await this.uninstallApp(app.identityHash);
      } catch (e) {
        this.log.error(`Could not uninstall app: ${app.identityHash}. Error: ${e.stack || e.message}`);
      }
    }
  };

  private handleInstalledDepositApps = async () => {
    const assetIds = this.config.supportedTokenAddresses;
    for (const assetId of assetIds) {
      const { appIdentityHash } = await this.checkDepositRights({ assetId });
      if (!appIdentityHash) {
        // no deposit app installed for asset, continue
        continue;
      }
      // otherwise, handle installed app
      const { appInstance } = await this.getAppInstance(appIdentityHash);
      if (!appInstance) {
        continue;
      }

      // if we are not the initiator, continue
      const latestState = appInstance.latestState as DepositAppState;
      if (latestState.transfers[0].to !== this.signerAddress) {
        continue;
      }

      // there is still an active deposit, setup a listener to
      // rescind deposit rights when deposit is sent to multisig
      const currentMultisigBalance = assetId === AddressZero
        ? await this.ethProvider.getBalance(this.multisigAddress)
        : await new Contract(assetId, tokenAbi, this.ethProvider)
            .functions.balanceOf(this.multisigAddress);

      if (currentMultisigBalance.gt(latestState.startingMultisigBalance)) {
        // deposit has occurred, rescind
        try {
          await this.rescindDepositRights({ assetId, appIdentityHash });
        } catch (e) {
          this.log.warn(`Could not uninstall deposit app ${appIdentityHash}. Error: ${e.stack || e.message}`);
        }
        continue;
      }

      // there is still an active deposit, setup a listener to
      // rescind deposit rights when deposit is sent to multisig
      if (assetId === AddressZero) {
        this.ethProvider.on(
          this.multisigAddress, 
          async (balance: BigNumber) => {
            if (balance.gt(latestState.startingMultisigBalance)) {
              await this.rescindDepositRights({ assetId, appIdentityHash });
            }
          },
        );
        continue;
      }

      new Contract(assetId, tokenAbi, this.ethProvider).once(
        "Transfer",
        async (sender: string, recipient: string, amount: BigNumber) => {
          if (recipient === this.multisigAddress && amount.gt(0)) {
            const bal = await new Contract(assetId, tokenAbi, this.ethProvider)
              .functions.balanceOf(this.multisigAddress);
            if (bal.gt(latestState.startingMultisigBalance)) {
              await this.rescindDepositRights({ assetId, appIdentityHash });
            }
          }
        },
      );
    }
  };

  private appNotInstalled = async (appIdentityHash: string): Promise<string | undefined> => {
    const apps = await this.getAppInstances();
    const app = apps.filter(
      (app: AppInstanceJson): boolean => app.identityHash === appIdentityHash,
    );
    if (!app || app.length === 0) {
      return (
        `Could not find installed app with id: ${appIdentityHash}. ` +
        `Installed apps: ${stringify(apps)}.`
      );
    }
    if (app.length > 1) {
      return (
        "CRITICAL ERROR: found multiple apps with the same id. " +
        `Installed apps: ${stringify(apps)}.`
      );
    }
    return undefined;
  };

  private appInstalled = async (appIdentityHash: string): Promise<string | undefined> => {
    const apps = await this.getAppInstances();
    const app = apps.filter(
      (app: AppInstanceJson): boolean => app.identityHash === appIdentityHash,
    );
    if (app.length > 0) {
      return (
        `App with id ${appIdentityHash} is already installed. ` +
        `Installed apps: ${stringify(apps)}.`
      );
    }
    return undefined;
  };

  private checkForUserWithdrawal = async (
    inBlock: number,
  ): Promise<TransactionResponse | undefined> => {
    const val = await this.getLatestWithdrawal();
    if (!val) {
      this.log.error("No transaction found in store.");
      return undefined;
    }

    const { tx } = val;
    // get the transaction hash that we should be looking for from
    // the contract method
    const txsTo = await this.ethProvider.getTransactionCount(tx.to, inBlock);
    if (txsTo === 0) {
      return undefined;
    }

    const block = await this.ethProvider.getBlock(inBlock);
    const { transactions } = block;
    if (transactions.length === 0) {
      return undefined;
    }

    for (const transactionHash of transactions) {
      const transaction = await this.ethProvider.getTransaction(transactionHash);
      if (this.matchTx(transaction, tx)) {
        return transaction;
      }
    }
    return undefined;
  };
}
