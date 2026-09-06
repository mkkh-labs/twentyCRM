import { gql } from '@apollo/client';

export type PolicyAuditEventListItem = Readonly<{
  id: string;
  occurredAt: string;
  phase: 'DECISION' | 'INTENT' | 'OUTCOME' | 'RECONCILIATION';
  actorType: 'user' | 'apiKey' | 'application' | 'system';
  actorId: string | null;
  authoritySource: string;
  operation: string;
  riskClass: 'R0' | 'R1' | 'R2' | 'R3';
  resourceType: string;
  resourceId: string | null;
  policyDecisionId: string;
  policyOutcome: 'ALLOW' | 'DENY';
  result: 'success' | 'failed' | 'denied' | 'partial' | 'unknown';
  reasonCodes: readonly string[];
  rootCorrelationId: string;
  attemptId: string;
  traceId: string | null;
  workflowRunId: string | null;
  jobId: string | null;
  mutationOrEffectId: string | null;
}>;

export type PolicyAuditEventsData = {
  policyAuditEvents: readonly PolicyAuditEventListItem[];
};

export type PolicyAuditEventsVariables = { limit: number };

export const GET_POLICY_AUDIT_EVENTS = gql`
  query GetPolicyAuditEvents($limit: Int!) {
    policyAuditEvents(limit: $limit)
  }
`;
