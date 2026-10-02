import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { In, LessThanOrEqual, Repository } from 'typeorm';

import { OutboxEventEntity } from 'src/engine/core-modules/transactional-outbox/entities/outbox-event.entity';
import {
  OUTBOX_EVENT_PUBLISHER,
  type OutboxEventPublisher,
} from 'src/engine/core-modules/transactional-outbox/services/outbox-event-publisher';

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_MAX_ATTEMPTS = 8;
const MAX_RETRY_DELAY_MILLISECONDS = 15 * 60 * 1000;
const CLAIM_LEASE_MILLISECONDS = 5 * 60 * 1000;

export type OutboxDispatchResult = Readonly<{
  published: number;
  retried: number;
  dead: number;
  reconciliationRequired: number;
  skipped: number;
}>;

@Injectable()
export class OutboxDispatcherService {
  constructor(
    // Global scheduler claim scan; every event-specific transition below also binds workspaceId.
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository
    @InjectRepository(OutboxEventEntity)
    private readonly repository: Repository<OutboxEventEntity>,
    @Inject(OUTBOX_EVENT_PUBLISHER)
    private readonly publisher: OutboxEventPublisher,
  ) {}

  async dispatchDue({
    batchSize = DEFAULT_BATCH_SIZE,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
  }: Readonly<{
    batchSize?: number;
    maxAttempts?: number;
  }> = {}): Promise<OutboxDispatchResult> {
    const now = new Date();
    const recovered = await this.repository.update(
      {
        state: 'DISPATCHING',
        availableAt: LessThanOrEqual(now),
      },
      {
        state: 'RECONCILIATION_REQUIRED',
        lastErrorCode: 'OUTBOX_CLAIM_OUTCOME_UNCERTAIN',
      },
    );
    const candidates = await this.repository.find({
      where: {
        state: In(['PENDING', 'RETRY_WAIT']),
        availableAt: LessThanOrEqual(now),
      },
      order: { createdAt: 'ASC' },
      take: batchSize,
    });
    const result = {
      dead: 0,
      published: 0,
      reconciliationRequired: recovered.affected ?? 0,
      retried: 0,
      skipped: 0,
    };

    for (const event of candidates) {
      const claimed = await this.repository.update(
        {
          id: event.id,
          workspaceId: event.workspaceId,
          state: In(['PENDING', 'RETRY_WAIT']),
        },
        {
          state: 'DISPATCHING',
          availableAt: new Date(now.getTime() + CLAIM_LEASE_MILLISECONDS),
        },
      );

      if (claimed.affected !== 1) {
        result.skipped += 1;
        continue;
      }

      try {
        await this.publisher.publish(event);
      } catch {
        const attemptCount = event.attemptCount + 1;
        const isDead = attemptCount >= maxAttempts;

        await this.repository.update(
          {
            id: event.id,
            workspaceId: event.workspaceId,
            state: 'DISPATCHING',
          },
          {
            state: isDead ? 'DEAD' : 'RETRY_WAIT',
            attemptCount,
            availableAt: new Date(
              Date.now() + this.retryDelayMilliseconds(attemptCount),
            ),
            lastErrorCode: 'OUTBOX_PUBLISH_FAILED',
          },
        );
        result[isDead ? 'dead' : 'retried'] += 1;
        continue;
      }

      const completed = await this.repository.update(
        {
          id: event.id,
          workspaceId: event.workspaceId,
          state: 'DISPATCHING',
        },
        {
          state: 'PUBLISHED',
          attemptCount: event.attemptCount + 1,
          publishedAt: new Date(),
          lastErrorCode: null,
        },
      );

      if (completed.affected !== 1) {
        await this.repository.update(
          { id: event.id, workspaceId: event.workspaceId },
          {
            state: 'RECONCILIATION_REQUIRED',
            attemptCount: event.attemptCount + 1,
            lastErrorCode: 'OUTBOX_PUBLISH_OUTCOME_UNCERTAIN',
          },
        );
        result.reconciliationRequired += 1;
        continue;
      }
      result.published += 1;
    }

    return result;
  }

  private retryDelayMilliseconds(attemptCount: number): number {
    return Math.min(2 ** attemptCount * 1000, MAX_RETRY_DELAY_MILLISECONDS);
  }
}
