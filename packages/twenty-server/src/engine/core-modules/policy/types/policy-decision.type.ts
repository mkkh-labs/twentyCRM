import {
  type PolicyCorrelationContext,
  type PolicyRiskClass,
} from 'src/engine/core-modules/policy/types/policy-context.type';

export type PolicyDecisionOutcome = 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL';

export type PolicyDecisionReasonCode =
  | 'APPROVAL_REQUIRED'
  | 'APPROVAL_EXPIRED'
  | 'APPROVAL_MISMATCH'
  | 'APPROVAL_REUSED'
  | 'AUDIT_UNAVAILABLE'
  | 'AUTHORITY_REVOKED'
  | 'AUTHORITY_UNRESOLVED'
  | 'AUTHORIZED'
  | 'BYPASS_AUTHORITY_FORBIDDEN'
  | 'FIELD_DENIED'
  | 'IDENTITY_MISSING'
  | 'AUTOMATION_DENIED'
  | 'KILL_SWITCH_ACTIVE'
  | 'POLICY_CONTEXT_MALFORMED'
  | 'POLICY_CONTEXT_MISMATCH'
  | 'POLICY_VERSION_UNSUPPORTED'
  | 'ROLE_DENIED'
  | 'ROW_DENIED'
  | 'SENSITIVE_METADATA_REJECTED'
  | 'SERVICE_OPERATION_FORBIDDEN'
  | 'SERVICE_RISK_FORBIDDEN'
  | 'TENANT_CONTEXT_MISSING';

export type PolicyDecision = Readonly<{
  schemaVersion: 1;
  id: string;
  parentDecisionId?: string;
  workspaceId: string;
  contextDigest: string;
  outcome: PolicyDecisionOutcome;
  reasonCodes: readonly PolicyDecisionReasonCode[];
  policyVersion: 'p0-v1';
  riskClass: PolicyRiskClass;
  evaluatedAt: string;
  correlation: PolicyCorrelationContext;
}>;
