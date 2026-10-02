import {
  type PolicyActor,
  type PolicyAuthoritySource,
  type PolicyCorrelationContext,
  type PolicyRiskClass,
} from 'src/engine/core-modules/policy/types/policy-context.type';
import { type PolicyAuditMetadata } from 'src/engine/core-modules/policy/types/policy-audit-metadata.type';
import {
  type PolicyDecisionOutcome,
  type PolicyDecisionReasonCode,
} from 'src/engine/core-modules/policy/types/policy-decision.type';

export type PolicyAuditPhase =
  | 'DECISION'
  | 'INTENT'
  | 'OUTCOME'
  | 'RECONCILIATION';

export type PolicyAuditResult =
  | 'success'
  | 'denied'
  | 'failed'
  | 'partial'
  | 'unknown';

type PolicyAuditEventBase = Readonly<{
  schemaVersion: 1;
  eventId: string;
  eventKey: string;
  workspaceId: string;
  policyDecisionId: string;
  parentPolicyDecisionId?: string;
  actor: PolicyActor;
  authoritySource: PolicyAuthoritySource;
  operation: string;
  riskClass: PolicyRiskClass;
  target: Readonly<{
    resourceType: string;
    resourceId?: string;
  }>;
  affectedFieldMetadataIds: readonly string[];
  policyOutcome: PolicyDecisionOutcome;
  contextDigest: string;
  reasonCodes: readonly PolicyDecisionReasonCode[];
  correlation: PolicyCorrelationContext;
  metadata: PolicyAuditMetadata;
  occurredAt: string;
}>;

export type PolicyAuditIntent = PolicyAuditEventBase &
  Readonly<{
    phase: 'DECISION' | 'INTENT';
  }>;

export type PolicyAuditOutcome = PolicyAuditEventBase &
  Readonly<{
    phase: 'OUTCOME' | 'RECONCILIATION';
    result: PolicyAuditResult;
  }>;

export type PolicyAuditEvent = PolicyAuditIntent | PolicyAuditOutcome;
