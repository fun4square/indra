import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AppInstanceRepository } from "../appInstance/appInstance.repository";
import { ChannelRepository } from "../channel/channel.repository";
import { SetStateCommitmentRepository } from "../setStateCommitment/setStateCommitment.repository";
import { WithdrawCommitmentRepository } from "../withdrawCommitment/withdrawCommitment.repository";
import { SetupCommitmentRepository } from "../setupCommitment/setupCommitment.repository";
// eslint-disable-next-line max-len
import { ConditionalTransactionCommitmentRepository } from "../conditionalCommitment/conditionalCommitment.repository";
import { ConfigModule } from "../config/config.module";
import { DatabaseModule } from "../database/database.module";
import { LockModule } from "../lock/lock.module";
import { LoggerModule } from "../logger/logger.module";
import { MessagingModule } from "../messaging/messaging.module";

import { cfCoreProviderFactory } from "./cfCore.provider";
import { CFCoreRecordRepository } from "./cfCore.repository";
import { CFCoreService } from "./cfCore.service";
import { CFCoreStore } from "./cfCore.store";
import { ChallengeRepository, ProcessedBlockRepository } from "../challenge/challenge.repository";
import { CacheModule } from "../caching/cache.module";
import { OnchainTransactionModule } from "../onchainTransactions/onchainTransaction.module";

@Module({
  exports: [cfCoreProviderFactory, CFCoreService, CFCoreStore],
  imports: [
    ConfigModule,
    DatabaseModule,
    LockModule,
    LoggerModule,
    MessagingModule,
    OnchainTransactionModule,
    TypeOrmModule.forFeature([
      CFCoreRecordRepository,
      ChannelRepository,
      AppInstanceRepository,
      ConditionalTransactionCommitmentRepository,
      SetStateCommitmentRepository,
      WithdrawCommitmentRepository,
      SetupCommitmentRepository,
      ChallengeRepository,
      ProcessedBlockRepository,
    ]),
    CacheModule,
  ],
  providers: [cfCoreProviderFactory, CFCoreService, CFCoreStore],
})
export class CFCoreModule {}
