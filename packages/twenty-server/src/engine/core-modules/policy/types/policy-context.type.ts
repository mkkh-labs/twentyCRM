import { type RolePermissionConfig } from 'src/engine/twenty-orm/types/role-permission-config';

export type PolicyRiskClass = 'R0' | 'R1' | 'R2' | 'R3';

export type ScopedRolePermissionConfig = Exclude<
  RolePermissionConfig,
  { shouldBypassPermissionChecks: true }
>;

type WorkspaceBoundPolicyActor = Readonly<{
  workspaceId: string;
}>;

export type PolicyActor =
  | (WorkspaceBoundPolicyActor &
      Readonly<{
        type: 'user';
        id: string;
        workspaceMemberId: string;
        applicationId?: string;
      }>)
  | (WorkspaceBoundPolicyActor &
      Readonly<{
        type: 'apiKey';
        id: string;
      }>)
  | (WorkspaceBoundPolicyActor &
      Readonly<{
        type: 'application';
        id: string;
      }>)
  | (WorkspaceBoundPolicyActor &
      Readonly<{
        type: 'system';
        id: null;
        serviceAuthorityId: string;
      }>);

export type PolicyAuthoritySource =
  | 'CALLER_BOUND'
  | 'DELEGATED_APPLICATION'
  | 'SCOPED_SERVICE_PRINCIPAL'
  | 'LEGACY_RECONSTRUCTED';

type PolicyAuthorityBase = Readonly<{
  workspaceId: string;
  authorityVersion: string;
  revocationState: 'ACTIVE';
  evaluatedAt: string;
}>;

export type PolicyAuthority =
  | (PolicyAuthorityBase &
      Readonly<{
        type: 'roles';
        source: Exclude<PolicyAuthoritySource, 'SCOPED_SERVICE_PRINCIPAL'>;
        rolePermissionConfig: ScopedRolePermissionConfig;
      }>)
  | (PolicyAuthorityBase &
      Readonly<{
        type: 'service';
        source: 'SCOPED_SERVICE_PRINCIPAL';
        serviceAuthorityId: string;
        allowedOperations: readonly string[];
        maximumRiskClass: 'R0';
      }>)
  | (PolicyAuthorityBase &
      Readonly<{
        type: 'serviceMutation';
        source: 'SCOPED_SERVICE_PRINCIPAL';
        serviceAuthorityId: string;
        allowedOperations: readonly string[];
        maximumRiskClass: 'R1';
      }>);

export type PolicyTarget = Readonly<{
  workspaceId: string;
  resourceType: string;
  resourceId?: string;
  objectMetadataId?: string;
  recordIds?: readonly string[];
  fieldMetadataIds?: readonly string[];
}>;

export type PolicyCorrelationContext = Readonly<{
  rootCorrelationId: string;
  decisionId: string;
  attemptId: string;
  traceId?: string;
  jobId?: string;
  workflowRunId?: string;
  mutationOrEffectId?: string;
}>;

export type PolicyContext = Readonly<{
  schemaVersion: 1;
  policyVersion: 'p0-v1';
  workspaceId: string;
  actor: PolicyActor;
  authority: PolicyAuthority;
  operation: string;
  riskClass: PolicyRiskClass;
  target: PolicyTarget;
  affectedFieldMetadataIds: readonly string[];
  correlation: PolicyCorrelationContext;
}>;
