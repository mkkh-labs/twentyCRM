/* @license Enterprise */

import { Logger, Scope } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isNonEmptyString, isNumber } from '@sniptt/guards';
import { createHash } from 'crypto';
import { type Repository } from 'typeorm';

import { BillingSubscriptionUpdateService } from 'src/engine/core-modules/billing/services/billing-subscription-update.service';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { type MessageQueueJobRetryContext } from 'src/engine/core-modules/message-queue/interfaces/message-queue-job.interface';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';

export type UpdateSubscriptionQuantityJobData = {
  workspaceId: string;
  operationId?: string;
  workspaceMembersCount?: number;
  idempotencyKey?: string;
};

@Processor({
  queueName: MessageQueue.billingQueue,
  scope: Scope.REQUEST,
})
export class UpdateSubscriptionQuantityJob {
  protected readonly logger = new Logger(UpdateSubscriptionQuantityJob.name);

  constructor(
    private readonly billingSubscriptionUpdateService: BillingSubscriptionUpdateService,
    @InjectRepository(UserWorkspaceEntity)
    private readonly userWorkspaceRepository: Repository<UserWorkspaceEntity>,
  ) {}

  @Process(UpdateSubscriptionQuantityJob.name)
  async handle(
    data: UpdateSubscriptionQuantityJobData,
    jobContext: MessageQueueJobRetryContext<UpdateSubscriptionQuantityJobData>,
  ): Promise<void> {
    const jobIdentity = isNonEmptyString(jobContext.jobId)
      ? jobContext.jobId
      : data.operationId;

    if (!isNonEmptyString(jobIdentity)) {
      throw new Error('Billing quantity job identity is required');
    }

    let workspaceMembersCount = data.workspaceMembersCount;
    let idempotencyKey = data.idempotencyKey;

    if (!isNumber(workspaceMembersCount) && !isNonEmptyString(idempotencyKey)) {
      workspaceMembersCount = await this.userWorkspaceRepository.count({
        where: { workspaceId: data.workspaceId },
      });

      if (workspaceMembersCount <= 0) {
        return;
      }

      idempotencyKey = this.buildIdempotencyKey({
        workspaceId: data.workspaceId,
        workspaceMembersCount,
        jobIdentity,
      });

      await jobContext.updateData({
        ...data,
        workspaceMembersCount,
        idempotencyKey,
      });
    }

    if (
      !isNumber(workspaceMembersCount) ||
      !Number.isInteger(workspaceMembersCount) ||
      workspaceMembersCount <= 0 ||
      !isNonEmptyString(idempotencyKey) ||
      idempotencyKey !==
        this.buildIdempotencyKey({
          workspaceId: data.workspaceId,
          workspaceMembersCount,
          jobIdentity,
        })
    ) {
      throw new Error('Invalid billing quantity job snapshot');
    }

    await this.billingSubscriptionUpdateService.changeSeats(
      data.workspaceId,
      workspaceMembersCount,
      { idempotencyKey },
    );

    this.logger.log(
      `Updated workspace ${data.workspaceId} subscription quantity to ${workspaceMembersCount} members`,
    );
  }

  private buildIdempotencyKey({
    workspaceId,
    workspaceMembersCount,
    jobIdentity,
  }: {
    workspaceId: string;
    workspaceMembersCount: number;
    jobIdentity: string;
  }): string {
    return createHash('sha256')
      .update(
        `${UpdateSubscriptionQuantityJob.name}:${workspaceId}:${workspaceMembersCount}:${jobIdentity}`,
      )
      .digest('hex');
  }
}
