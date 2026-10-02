import { type PolicyContext } from 'src/engine/core-modules/policy/types/policy-context.type';
import { type PolicyAuditMetadata } from 'src/engine/core-modules/policy/types/policy-audit-metadata.type';
import { type PolicyDecision } from 'src/engine/core-modules/policy/types/policy-decision.type';

export type ProtectedOperationResult<TResult> =
  | Readonly<{
      status: 'SUCCEEDED';
      value: TResult;
      policyDecisionId: string;
    }>
  | Readonly<{
      status: 'DENIED';
      policyDecisionId: string;
      reasonCodes: readonly string[];
    }>
  | Readonly<{
      status: 'RECONCILIATION_REQUIRED';
      policyDecisionId: string;
      providerReference?: string;
    }>;

export type ProtectedOperationInput<TResult> = Readonly<{
  context: PolicyContext;
  decision: PolicyDecision;
  auditMetadata: PolicyAuditMetadata;
  execute: () => Promise<TResult>;
  getProviderReference?: (result: TResult) => string | undefined;
}>;
