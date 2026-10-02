import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  Unique,
} from 'typeorm';

import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';

export type OutboxEventState =
  | 'PENDING'
  | 'DISPATCHING'
  | 'PUBLISHED'
  | 'RETRY_WAIT'
  | 'RECONCILIATION_REQUIRED'
  | 'DEAD';

@Index('IDX_OUTBOX_EVENT_STATE_AVAILABLE', ['state', 'availableAt'])
@Index('IDX_OUTBOX_EVENT_WORKSPACE_AGGREGATE', [
  'workspaceId',
  'aggregateType',
  'aggregateId',
])
@Unique('UQ_OUTBOX_EVENT_WORKSPACE_ID', ['workspaceId', 'id'])
@Check('CHK_OUTBOX_EVENT_SCHEMA_VERSION', '"schemaVersion" > 0')
@Check(
  'CHK_OUTBOX_EVENT_PAYLOAD_DIGEST',
  '"payloadDigest" ~ \'^[a-f0-9]{64}$\'',
)
@Entity({ name: 'outboxEvent', schema: 'core' })
export class OutboxEventEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'varchar', length: 128 })
  eventType: string;

  @Column({ type: 'smallint' })
  schemaVersion: number;

  @Column({ type: 'varchar', length: 128 })
  aggregateType: string;

  @Column({ type: 'varchar', length: 256 })
  aggregateId: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'char', length: 64 })
  payloadDigest: string;

  @Column({ type: 'uuid' })
  rootCorrelationId: string;

  @Column({ type: 'varchar', length: 32 })
  state: OutboxEventState;

  @Column({ type: 'integer', default: 0 })
  attemptCount: number;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  availableAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  lastErrorCode: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
