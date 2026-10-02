import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Relation,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { OutboxEventEntity } from 'src/engine/core-modules/transactional-outbox/entities/outbox-event.entity';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';

export type OutboxConsumerReceiptState =
  | 'PROCESSING'
  | 'COMPLETED'
  | 'RECONCILIATION_REQUIRED';

@Unique('UQ_OUTBOX_CONSUMER_RECEIPT_EVENT_CONSUMER', [
  'workspaceId',
  'outboxEventId',
  'consumerName',
])
@Index('IDX_OUTBOX_CONSUMER_RECEIPT_WORKSPACE_STATE', ['workspaceId', 'state'])
@Entity({ name: 'outboxConsumerReceipt', schema: 'core' })
export class OutboxConsumerReceiptEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  outboxEventId: string;

  @ManyToOne(() => OutboxEventEntity, { onDelete: 'CASCADE' })
  @JoinColumn([
    {
      name: 'workspaceId',
      referencedColumnName: 'workspaceId',
      foreignKeyConstraintName: 'FK_OUTBOX_CONSUMER_RECEIPT_EVENT',
    },
    { name: 'outboxEventId', referencedColumnName: 'id' },
  ])
  outboxEvent: Relation<OutboxEventEntity>;

  @Column({ type: 'varchar', length: 128 })
  consumerName: string;

  @Column({ type: 'varchar', length: 32 })
  state: OutboxConsumerReceiptState;

  @Column({ type: 'varchar', length: 64, nullable: true })
  lastErrorCode: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
