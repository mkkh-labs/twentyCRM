import { Injectable } from '@nestjs/common';

import { LessThan } from 'typeorm';

import { OUTBOX_CONSUMER_PROCESSING_LEASE_MILLISECONDS } from 'src/engine/core-modules/transactional-outbox/constants/outbox-consumer-processing-lease.constant';
import { OutboxConsumerReceiptEntity } from 'src/engine/core-modules/transactional-outbox/entities/outbox-consumer-receipt.entity';
import { OutboxEventEntity } from 'src/engine/core-modules/transactional-outbox/entities/outbox-event.entity';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { type WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

const MINIMUM_RETENTION_DAYS = 30;
const MAXIMUM_RETENTION_DAYS = 1095;

@Injectable()
export class OutboxRetentionService {
  constructor(
    @InjectWorkspaceScopedRepository(OutboxEventEntity)
    private readonly outboxEventRepository: WorkspaceScopedRepository<OutboxEventEntity>,
    @InjectWorkspaceScopedRepository(OutboxConsumerReceiptEntity)
    private readonly outboxConsumerReceiptRepository: WorkspaceScopedRepository<OutboxConsumerReceiptEntity>,
  ) {}

  async cleanupWorkspace({
    workspaceId,
    retentionDays,
  }: Readonly<{
    workspaceId: string;
    retentionDays: number;
  }>): Promise<{ deleted: number; reconciliationRequired: number }> {
    if (
      !Number.isInteger(retentionDays) ||
      retentionDays < MINIMUM_RETENTION_DAYS ||
      retentionDays > MAXIMUM_RETENTION_DAYS
    ) {
      throw new Error('Outbox retention must be between 30 and 1095 days');
    }

    const now = new Date();
    const processingLeaseCutoff = new Date(
      now.getTime() - OUTBOX_CONSUMER_PROCESSING_LEASE_MILLISECONDS,
    );
    const staleReceipts = await this.outboxConsumerReceiptRepository.find(
      workspaceId,
      {
        where: {
          state: 'PROCESSING',
          updatedAt: LessThan(processingLeaseCutoff),
        },
        select: ['outboxEventId'],
      },
    );
    let reconciliationRequired = 0;

    for (const receipt of staleReceipts) {
      const reconciled = await this.outboxConsumerReceiptRepository.update(
        workspaceId,
        {
          outboxEventId: receipt.outboxEventId,
          state: 'PROCESSING',
          updatedAt: LessThan(processingLeaseCutoff),
        },
        {
          state: 'RECONCILIATION_REQUIRED',
          lastErrorCode: 'OUTBOX_CONSUMER_PROCESSING_LEASE_EXPIRED',
        },
      );

      if (reconciled.affected !== 1) {
        continue;
      }

      await this.outboxEventRepository.update(
        workspaceId,
        { id: receipt.outboxEventId },
        {
          state: 'RECONCILIATION_REQUIRED',
          lastErrorCode: 'OUTBOX_CONSUMER_PROCESSING_LEASE_EXPIRED',
        },
      );
      reconciliationRequired += 1;
    }

    const cutoff = new Date(now);

    cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);

    const retentionCandidates = await this.outboxEventRepository.find(
      workspaceId,
      {
        where: {
          state: 'PUBLISHED',
          publishedAt: LessThan(cutoff),
        },
        select: ['id'],
      },
    );
    let deleted = 0;

    for (const event of retentionCandidates) {
      const completedReceipt =
        await this.outboxConsumerReceiptRepository.findOne(workspaceId, {
          where: {
            outboxEventId: event.id,
            consumerName: 'internal-event-bus',
            state: 'COMPLETED',
          },
        });

      if (completedReceipt === null) {
        continue;
      }

      const result = await this.outboxEventRepository.delete(workspaceId, {
        id: event.id,
        state: 'PUBLISHED',
        publishedAt: LessThan(cutoff),
      });

      deleted += result.affected ?? 0;
    }

    return { deleted, reconciliationRequired };
  }
}
