import "./setup";
// Run happy-path tests first
import "./store/multiChannel.test";

import "./deposit/happy.test";
import "./deposit/rights.test";
import "./swap/happy.test";
import "./transfer/linkedTransfer.test";
import "./multichain.test";
import "./withdraw/happy.test";
import "./challenge.test";
import "./channelProvider.test";
import "./collateral/profiles.test";
import "./collateral/reclaim.test";
import "./collateral/request.test";
import "./connect.test";
import "./get/appRegistry.test";
import "./get/stateChannel.test";
import "./store/happy.test";
import "./store/restoreState.test";
import "./transfer/asyncTransfer.test";
import "./transfer/concurrentTransfers.test";
import "./transfer/graphBatchedTransfer.test";
import "./transfer/graphTransfer.test";
import "./transfer/hashLockTransfer.test";
import "./transfer/inflightSwap.test";
import "./transfer/pingpong.test";
import "./transfer/signedTransfer.test";
import "./transfer/transfer.test";
// Run sad-path tests last
import "./deposit/offline.test";
import "./swap/offline.test";
import "./transfer/asyncTransferOffline.test";
import "./transfer/graphTransferOffline.test";
import "./withdraw/offline.test";
