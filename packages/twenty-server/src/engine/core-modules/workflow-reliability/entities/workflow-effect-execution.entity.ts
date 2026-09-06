import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { type WorkflowExecutionState } from 'src/engine/core-modules/workflow-reliability/types/workflow-execution-state.type';

@Unique('UQ_WORKFLOW_EFFECT_WORKSPACE_KEY', ['workspaceId', 'effectKey'])
@Index('IDX_WORKFLOW_EFFECT_WORKSPACE_STATE_RETRY', [
  'workspaceId',
  'state',
  'retryAt',
])
@Index('IDX_WORKFLOW_EFFECT_WORKSPACE_RUN', ['workspaceId', 'workflowRunId'])
@Check('CHK_WORKFLOW_EFFECT_KEY', '"effectKey" ~ \'^[a-f0-9]{64}$\'')
@Check(
  'CHK_WORKFLOW_EFFECT_ACTION_DIGEST',
  '"actionDigest" ~ \'^[a-f0-9]{64}$\'',
)
@Entity({ name: 'workflowEffectExecution', schema: 'core' })
export class WorkflowEffectExecutionEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'char', length: 64 })
  effectKey: string;

  @Column({ type: 'uuid' })
  workflowRunId: string;

  @Column({ type: 'varchar', length: 256 })
  stepId: string;

  @Column({ type: 'char', length: 64 })
  actionDigest: string;

  @Column({ type: 'varchar', length: 32 })
  state: WorkflowExecutionState;

  @Column({ type: 'integer', default: 0 })
  attemptCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  retryAt: Date | null;

  @Column({ type: 'varchar', length: 64 })
  providerClass: string;

  @Column({ type: 'char', length: 64, nullable: true })
  providerReferenceDigest: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  lastErrorCode: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  uncertaintyReason: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
