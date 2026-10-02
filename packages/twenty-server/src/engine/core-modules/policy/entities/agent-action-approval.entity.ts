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

@Index('IDX_AGENT_APPROVAL_WORKSPACE_PENDING', [
  'workspaceId',
  'consumedAt',
  'expiresAt',
])
@Check(
  'CHK_AGENT_APPROVAL_ACTION_DIGEST',
  '"actionDigest" ~ \'^[a-f0-9]{64}$\'',
)
@Entity({ name: 'agentActionApproval', schema: 'core' })
export class AgentActionApprovalEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  actorId: string;

  @Column({ type: 'uuid' })
  approverId: string;

  @Column({ type: 'varchar', length: 128 })
  action: string;

  @Column({ type: 'varchar', length: 256 })
  target: string;

  @Column({ type: 'varchar', length: 2 })
  riskClass: Extract<PolicyRiskClass, 'R2' | 'R3'>;

  @Column({ type: 'char', length: 64 })
  actionDigest: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  consumedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  consumedByDecisionId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
