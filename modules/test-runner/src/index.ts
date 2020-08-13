import "./setup";
// Run happy-path tests first

import "./collateral/collateral.test";
import "./collateral/profiles.test";
import "./collateral/reclaim.test";

import "./connect.test";
import "./channelProvider.test";
import "./restoreState.test";
import "./deposit/happy.test";
import "./deposit/rights.test";
import "./flows/multichain.test";
import "./flows/multichannelStore.test";
import "./flows/multiclientTransfer.test";
import "./flows/transfer.test";
import "./get/appRegistry.test";
import "./get/stateChannel.test";
import "./swap/happy.test";
import "./transfer/asyncTransfer.test";
import "./transfer/concurrentTransfers.test";
import "./transfer/graphBatchedTransfer.test";
import "./transfer/graphTransfer.test";
import "./transfer/hashLockTransfer.test";
import "./transfer/inflightSwap.test";
import "./transfer/linkedTransfer.test";
import "./transfer/signedTransfer.test";
import "./withdraw/happy.test";
// Run sad-path tests last
import "./deposit/offline.test";
import "./swap/offline.test";
import "./transfer/asyncTransferOffline.test";
import "./transfer/graphTransferOffline.test";
import "./withdraw/offline.test";
