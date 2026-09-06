import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { buildDeterministicDigest } from 'src/engine/core-modules/policy/utils/build-deterministic-digest.util';
import { OutboxConsumerReceiptEntity } from 'src/engine/core-modules/transactional-outbox/entities/outbox-consumer-receipt.entity';
import { OutboxEventEntity } from 'src/engine/core-modules/transactional-outbox/entities/outbox-event.entity';
import { type OutboxEventDeliveryEnvelope } from 'src/engine/core-modules/transactional-outbox/types/outbox-event-delivery-envelope.type';
import { type OutboxEventDeliveryJobData } from 'src/engine/core-modules/transactional-outbox/types/outbox-event-delivery-job-data.type';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

const INTERNAL_EVENT_BUS_CONSUMER = 'internal-event-bus';
const EVENT_TYPE_PATTERN = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)*$/;

export type OutboxConsumeResult = Readonly<{
  status: 'DELIVERED' | 'ALREADY_DELIVERED' | 'RECONCILIATION_REQUIRED';
}>;

@Injectable()
export class OutboxEventConsumerService {
  constructor(
    @InjectWorkspaceScopedRepository(OutboxConsumerReceiptEntity)
    private readonly receiptRepository: WorkspaceScopedRepository<OutboxConsumerReceiptEntity>,
    @InjectWorkspaceScopedRepository(OutboxEventEntity)
    private readonly eventRepository: WorkspaceScopedRepository<OutboxEventEntity>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async consume({
    outboxEventId,
    workspaceId,
  }: OutboxEventDeliveryJobData): Promise<OutboxConsumeResult> {
    const event = await this.eventRepository.findOne(workspaceId, {
      where: { id: outboxEventId },
    });

    if (!this.isValidEvent(event, workspaceId)) {
      throw new Error('Outbox event is invalid or foreign.');
    }

    const existing = await this.receiptRepository.findOne(workspaceId, {
      where: {
        outboxEventId,
        consumerName: INTERNAL_EVENT_BUS_CONSUMER,
      },
    });

    if (existing?.state === 'COMPLETED') {
      return { status: 'ALREADY_DELIVERED' };
    }

    if (existing) {
      await this.markReconciliationRequired(
        outboxEventId,
        workspaceId,
        'OUTBOX_CONSUMER_OUTCOME_UNCERTAIN',
      );

      return { status: 'RECONCILIATION_REQUIRED' };
    }

    try {
      await this.receiptRepository.insert(workspaceId, {
        id: randomUUID(),
        outboxEventId,
        consumerName: INTERNAL_EVENT_BUS_CONSUMER,
        state: 'PROCESSING',
        lastErrorCode: null,
      });
    } catch (error) {
      const concurrentReceipt = await this.receiptRepository.findOne(
        workspaceId,
        {
          where: {
            outboxEventId,
            consumerName: INTERNAL_EVENT_BUS_CONSUMER,
          },
        },
      );

      if (concurrentReceipt) {
        if (concurrentReceipt.state === 'COMPLETED') {
          return { status: 'ALREADY_DELIVERED' };
        }

        await this.markReconciliationRequired(
          outboxEventId,
          workspaceId,
          'OUTBOX_CONSUMER_OUTCOME_UNCERTAIN',
        );

        return { status: 'RECONCILIATION_REQUIRED' };
      }

      throw error;
    }

    const envelope: OutboxEventDeliveryEnvelope = {
      eventId: event.id,
      workspaceId: event.workspaceId,
      eventType: event.eventType,
      schemaVersion: event.schemaVersion,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: event.payload,
      payloadDigest: event.payloadDigest,
      rootCorrelationId: event.rootCorrelationId,
    };

    try {
      await this.eventEmitter.emitAsync(
        `outbox.${event.eventType}.v${event.schemaVersion}`,
        envelope,
      );
    } catch {
      await this.markReconciliationRequired(
        outboxEventId,
        workspaceId,
        'OUTBOX_CONSUMER_EFFECT_UNCERTAIN',
      );

      return { status: 'RECONCILIATION_REQUIRED' };
    }

    const completed = await this.receiptRepository.update(
      workspaceId,
      {
        outboxEventId,
        consumerName: INTERNAL_EVENT_BUS_CONSUMER,
        state: 'PROCESSING',
      },
      { state: 'COMPLETED', lastErrorCode: null },
    );

    if (completed.affected !== 1) {
      await this.markReconciliationRequired(
        outboxEventId,
        workspaceId,
        'OUTBOX_CONSUMER_COMPLETION_UNCERTAIN',
      );

      return { status: 'RECONCILIATION_REQUIRED' };
    }

    return { status: 'DELIVERED' };
  }

  private isValidEvent(
    event: OutboxEventEntity | null,
    workspaceId: string,
  ): event is OutboxEventEntity {
    return (
      event !== null &&
      event.workspaceId === workspaceId &&
      EVENT_TYPE_PATTERN.test(event.eventType) &&
      event.schemaVersion > 0 &&
      buildDeterministicDigest(event.payload) === event.payloadDigest &&
      (event.state === 'DISPATCHING' || event.state === 'PUBLISHED')
    );
  }

  private async markReconciliationRequired(
    outboxEventId: string,
    workspaceId: string,
    lastErrorCode: string,
  ): Promise<void> {
    await this.eventRepository.update(
      workspaceId,
      { id: outboxEventId },
      { state: 'RECONCILIATION_REQUIRED', lastErrorCode },
    );
    await this.receiptRepository.update(
      workspaceId,
      {
        outboxEventId,
        consumerName: INTERNAL_EVENT_BUS_CONSUMER,
      },
      { state: 'RECONCILIATION_REQUIRED', lastErrorCode },
    );
  }
}
