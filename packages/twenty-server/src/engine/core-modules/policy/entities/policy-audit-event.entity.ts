import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  Unique,
} from 'typeorm';

import {
  type PolicyAuthoritySource,
  type PolicyRiskClass,
} from 'src/engine/core-modules/policy/types/policy-context.type';
import { type PolicyAuditMetadata } from 'src/engine/core-modules/policy/types/policy-audit-metadata.type';
import {
  type PolicyAuditPhase,
  type PolicyAuditResult,
} from 'src/engine/core-modules/policy/types/policy-audit-event.type';
import {
  type PolicyDecisionOutcome,
  type PolicyDecisionReasonCode,
} from 'src/engine/core-modules/policy/types/policy-decision.type';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';

@Unique('UQ_POLICY_AUDIT_WORKSPACE_EVENT_KEY', ['workspaceId', 'eventKey'])
@Index('IDX_POLICY_AUDIT_WORKSPACE_OCCURRED', ['workspaceId', 'occurredAt'])
@Index(
  'IDX_POLICY_AUDIT_UNRESOLVED_ALLOWED',
  ['occurredAt', 'workspaceId', 'policyDecisionId'],
  { where: `"policyOutcome" = 'ALLOW' AND "result" = 'unknown'` },
)
@Index('IDX_POLICY_AUDIT_WORKSPACE_CORRELATION', [
  'workspaceId',
  'rootCorrelationId',
])
@Index('IDX_POLICY_AUDIT_WORKSPACE_DECISION', [
  'workspaceId',
  'policyDecisionId',
])
@Check('CHK_POLICY_AUDIT_SCHEMA_VERSION', '"schemaVersion" = 1')
@Check(
  'CHK_POLICY_AUDIT_CONTEXT_DIGEST',
  '"contextDigest" ~ \'^[a-f0-9]{64}$\'',
)
@Entity({ name: 'policyAuditEvent', schema: 'core' })
export class PolicyAuditEventEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'varchar', length: 256 })
  eventKey: string;

  @Column({ type: 'smallint', default: 1 })
  schemaVersion: 1;

  @CreateDateColumn({ type: 'timestamptz' })
  occurredAt: Date;

  @Column({ type: 'varchar', length: 32 })
  phase: PolicyAuditPhase;

  @Column({ type: 'varchar', length: 32 })
  actorType: 'user' | 'apiKey' | 'application' | 'system';

  @Column({ type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ type: 'uuid', nullable: true })
  workspaceMemberId: string | null;

  @Column({ type: 'uuid', nullable: true })
  applicationId: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  serviceAuthorityId: string | null;

  @Column({ type: 'varchar', length: 32 })
  authoritySource: PolicyAuthoritySource;

  @Column({ type: 'varchar', length: 128 })
  operation: string;

  @Column({ type: 'varchar', length: 2 })
  riskClass: PolicyRiskClass;

  @Column({ type: 'varchar', length: 128 })
  resourceType: string;

  @Column({ type: 'varchar', length: 256, nullable: true })
  resourceId: string | null;

  @Column({ type: 'jsonb', default: [] })
  fieldMetadataIds: string[];

  @Column({ type: 'uuid' })
  policyDecisionId: string;

  @Column({ type: 'uuid', nullable: true })
  parentPolicyDecisionId: string | null;

  @Column({ type: 'varchar', length: 32 })
  policyOutcome: PolicyDecisionOutcome;

  @Column({ type: 'varchar', length: 32 })
  result: PolicyAuditResult;

  @Column({ type: 'jsonb', default: [] })
  reasonCodes: PolicyDecisionReasonCode[];

  @Column({ type: 'varchar', length: 32, default: 'p0-v1' })
  policyVersion: 'p0-v1';

  @Column({ type: 'char', length: 64 })
  contextDigest: string;

  @Column({ type: 'uuid' })
  rootCorrelationId: string;

  @Column({ type: 'uuid' })
  attemptId: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  traceId: string | null;

  @Column({ type: 'uuid', nullable: true })
  workflowRunId: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  jobId: string | null;

  @Column({ type: 'uuid', nullable: true })
  mutationOrEffectId: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: PolicyAuditMetadata;
}
