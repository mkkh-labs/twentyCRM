import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

import { DataSource, type EntityManager } from 'typeorm';
import { type QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

import { OutboxEventEntity } from 'src/engine/core-modules/transactional-outbox/entities/outbox-event.entity';
import { buildDeterministicDigest } from 'src/engine/core-modules/policy/utils/build-deterministic-digest.util';
import { type WorkspaceTransactionScope } from 'src/engine/twenty-orm/types/workspace-transaction-scope.type';

export type TransactionalOutboxEvent = Readonly<{
  id: string;
  eventType: string;
  schemaVersion: number;
  aggregateType: string;
  aggregateId: string;
  payload: Readonly<Record<string, unknown>>;
  rootCorrelationId: string;
}>;

@Injectable()
export class TransactionalOutboxService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async execute<TResult>({
    workspaceId,
    event,
    mutate,
  }: Readonly<{
    workspaceId: string;
    event:
      | TransactionalOutboxEvent
      | ((result: TResult) => TransactionalOutboxEvent);
    mutate: (manager: EntityManager) => Promise<TResult>;
  }>): Promise<TResult> {
    return this.dataSource.transaction(async (manager) => {
      const result = await mutate(manager);
      const resolvedEvent = typeof event === 'function' ? event(result) : event;

      const entityInput = {
        ...resolvedEvent,
        workspaceId,
        payload: resolvedEvent.payload as Record<string, unknown>,
        payloadDigest: buildDeterministicDigest(resolvedEvent.payload),
        state: 'PENDING',
        attemptCount: 0,
        availableAt: new Date(),
        publishedAt: null,
        lastErrorCode: null,
      } as QueryDeepPartialEntity<OutboxEventEntity>;

      await manager.getRepository(OutboxEventEntity).insert(entityInput);

      return result;
    });
  }

  async insertWithinWorkspaceTransaction({
    workspaceId,
    event,
    transactionScope,
  }: Readonly<{
    workspaceId: string;
    event: TransactionalOutboxEvent;
    transactionScope: WorkspaceTransactionScope;
  }>): Promise<void> {
    await transactionScope.executeRawQuery(
      `INSERT INTO core."outboxEvent"
         ("workspaceId", "id", "eventType", "schemaVersion", "aggregateType",
          "aggregateId", "payload", "payloadDigest", "rootCorrelationId",
          "state", "attemptCount", "availableAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, 'PENDING', 0, NOW())`,
      [
        workspaceId,
        event.id,
        event.eventType,
        event.schemaVersion,
        event.aggregateType,
        event.aggregateId,
        JSON.stringify(event.payload),
        buildDeterministicDigest(event.payload),
        event.rootCorrelationId,
      ],
    );
  }
}
