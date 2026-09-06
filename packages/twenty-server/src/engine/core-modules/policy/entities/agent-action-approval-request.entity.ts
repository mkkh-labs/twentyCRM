import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

import { type PolicyRiskClass } from 'src/engine/core-modules/policy/types/policy-context.type';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';

export type AgentActionApprovalRequestStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'DENIED'
  | 'EXPIRED';

@Index('IDX_AGENT_APPROVAL_REQUEST_WORKSPACE_STATUS', [
  'workspaceId',
  'status',
  'expiresAt',
])
@Index(
  'UQ_AGENT_APPROVAL_REQUEST_PENDING_ACTION',
  ['workspaceId', 'actorId', 'actionDigest'],
  { unique: true, where: '"status" = \'PENDING\'' },
)
@Check(
  'CHK_AGENT_APPROVAL_REQUEST_ACTION_DIGEST',
  '"actionDigest" ~ \'^[a-f0-9]{64}$\'',
)
@Entity({ name: 'agentActionApprovalRequest', schema: 'core' })
export class AgentActionApprovalRequestEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  actorId: string;

  @Column({ type: 'varchar', length: 128 })
  action: string;

  @Column({ type: 'varchar', length: 256 })
  target: string;

  @Column({ type: 'varchar', length: 2 })
  riskClass: PolicyRiskClass;

  @Column({ type: 'char', length: 64 })
  actionDigest: string;

  @Column({ type: 'varchar', length: 16 })
  status: AgentActionApprovalRequestStatus;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'uuid', nullable: true })
  approvalId: string | null;

  @Column({ type: 'uuid', nullable: true })
  workflowRunId: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  workflowStepId: string | null;

  @Column({ type: 'uuid', nullable: true })
  rootCorrelationId: string | null;

  @Column({ type: 'uuid', nullable: true })
  originPolicyDecisionId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
