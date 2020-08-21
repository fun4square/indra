import { EntityRepository, Repository, EntityManager } from "typeorm";
import { AppName, AppActions } from "@connext/types";

import { Transfer } from "./transfer.entity";
import { AppInstance } from "../appInstance/appInstance.entity";

@EntityRepository(Transfer)
export class TransferRepository extends Repository<Transfer<any>> {
  async removeTransferAction<T extends AppName>(paymentId: string) {
    await this.manager.transaction(async (transactionalEntityManager: EntityManager) => {
      await transactionalEntityManager
        .createQueryBuilder()
        .update(Transfer)
        .set({
          action: undefined,
        })
        .where("paymentId = :paymentId", { paymentId })
        .execute();
    });
  }

  async addTransferAction<T extends AppName>(paymentId: string, action: AppActions[T]) {
    await this.manager.transaction(async (transactionalEntityManager: EntityManager) => {
      await transactionalEntityManager
        .createQueryBuilder()
        .update(Transfer)
        .set({
          action,
        })
        .where("paymentId = :paymentId", { paymentId })
        .execute();
    });
  }

  async addTransferReceiver<T extends AppName>(paymentId: string, receiverApp: AppInstance<T>) {
    await this.manager.transaction(async (transactionalEntityManager: EntityManager) => {
      await transactionalEntityManager
        .createQueryBuilder()
        .update(Transfer)
        .set({
          receiverApp,
        })
        .where("paymentId = :paymentId", { paymentId })
        .execute();
    });
  }

  async findByPaymentId<T extends AppName>(paymentId: string): Promise<Transfer<T> | undefined> {
    return this.createQueryBuilder("transfer")
      .leftJoinAndSelect("transfer.receiverApp", "receiverApp")
      .leftJoinAndSelect("transfer.senderApp", "senderApp")
      .where("transfer.paymentId = :paymentId", { paymentId })
      .getOne();
  }

  async createTransfer<T extends AppName>(
    paymentId: string,
    senderApp: AppInstance<T>,
    receiverApp?: AppInstance<T>,
  ) {
    await this.manager.transaction(async (transactionalEntityManager: EntityManager) => {
      await transactionalEntityManager
        .createQueryBuilder()
        .insert()
        .into(Transfer)
        .values({
          senderApp,
          receiverApp,
          paymentId,
        })
        .execute();
    });
  }
}
