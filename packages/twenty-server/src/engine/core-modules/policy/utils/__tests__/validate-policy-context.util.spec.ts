import { type PolicyContext } from 'src/engine/core-modules/policy/types/policy-context.type';
import { validatePolicyContext } from 'src/engine/core-modules/policy/utils/validate-policy-context.util';

const WORKSPACE_ID = '20202020-1111-4111-8111-111111111111';
const ACTOR_ID = '20202020-2222-4222-8222-222222222222';
const WORKSPACE_MEMBER_ID = '20202020-3333-4333-8333-333333333333';
const ROLE_ID = '20202020-4444-4444-8444-444444444444';
const OBJECT_METADATA_ID = '20202020-5555-4555-8555-555555555555';
const RECORD_ID = '20202020-6666-4666-8666-666666666666';
const FIELD_METADATA_ID = '20202020-7777-4777-8777-777777777777';
const ROOT_CORRELATION_ID = '20202020-8888-4888-8888-888888888888';
const DECISION_ID = '20202020-9999-4999-8999-999999999999';
const ATTEMPT_ID = '20202020-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const buildValidUserContext = (): PolicyContext => ({
  schemaVersion: 1,
  policyVersion: 'p0-v1',
  workspaceId: WORKSPACE_ID,
  actor: {
    type: 'user',
    id: ACTOR_ID,
    workspaceId: WORKSPACE_ID,
    workspaceMemberId: WORKSPACE_MEMBER_ID,
  },
  authority: {
    type: 'roles',
    source: 'CALLER_BOUND',
    workspaceId: WORKSPACE_ID,
    rolePermissionConfig: { unionOf: [ROLE_ID] },
    authorityVersion: 'role-map:1',
    revocationState: 'ACTIVE',
    evaluatedAt: '2026-09-01T12:00:00.000Z',
  },
  operation: 'record.update',
  riskClass: 'R1',
  target: {
    workspaceId: WORKSPACE_ID,
    resourceType: 'objectRecord',
    resourceId: RECORD_ID,
    objectMetadataId: OBJECT_METADATA_ID,
    recordIds: [RECORD_ID],
    fieldMetadataIds: [FIELD_METADATA_ID],
  },
  affectedFieldMetadataIds: [FIELD_METADATA_ID],
  correlation: {
    rootCorrelationId: ROOT_CORRELATION_ID,
    decisionId: DECISION_ID,
    attemptId: ATTEMPT_ID,
  },
});

describe('validatePolicyContext', () => {
  it('accepts a complete caller-bound user context', () => {
    const context = buildValidUserContext();

    expect(validatePolicyContext(context)).toEqual({
      valid: true,
      context,
    });
  });

  it('accepts a scoped service principal for an allowlisted R0 operation', () => {
    const context: PolicyContext = {
      ...buildValidUserContext(),
      actor: {
        type: 'system',
        id: null,
        workspaceId: WORKSPACE_ID,
        serviceAuthorityId: 'workflow-bootstrap',
      },
      authority: {
        type: 'service',
        source: 'SCOPED_SERVICE_PRINCIPAL',
        workspaceId: WORKSPACE_ID,
        serviceAuthorityId: 'workflow-bootstrap',
        allowedOperations: ['workflow.configuration.read'],
        maximumRiskClass: 'R0',
        authorityVersion: 'workflow-bootstrap:1',
        revocationState: 'ACTIVE',
        evaluatedAt: '2026-09-01T12:00:00.000Z',
      },
      operation: 'workflow.configuration.read',
      riskClass: 'R0',
      target: {
        workspaceId: WORKSPACE_ID,
        resourceType: 'workflowConfiguration',
      },
      affectedFieldMetadataIds: [],
    };

    expect(validatePolicyContext(context)).toEqual({
      valid: true,
      context,
    });
  });

  it.each([
    {
      name: 'missing actor identity',
      mutate: (context: Record<string, unknown>) => {
        context.actor = {
          type: 'user',
          id: '',
          workspaceId: WORKSPACE_ID,
          workspaceMemberId: WORKSPACE_MEMBER_ID,
        };
      },
      reason: 'IDENTITY_MISSING',
    },
    {
      name: 'cross-workspace authority',
      mutate: (context: Record<string, unknown>) => {
        context.authority = {
          ...(context.authority as object),
          workspaceId: '20202020-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        };
      },
      reason: 'POLICY_CONTEXT_MISMATCH',
    },
    {
      name: 'revoked authority',
      mutate: (context: Record<string, unknown>) => {
        context.authority = {
          ...(context.authority as object),
          revocationState: 'REVOKED',
        };
      },
      reason: 'AUTHORITY_REVOKED',
    },
    {
      name: 'unsupported schema version',
      mutate: (context: Record<string, unknown>) => {
        context.schemaVersion = 2;
      },
      reason: 'POLICY_VERSION_UNSUPPORTED',
    },
  ])('denies $name', ({ mutate, reason }) => {
    const context = structuredClone(
      buildValidUserContext(),
    ) as unknown as Record<string, unknown>;

    mutate(context);

    expect(validatePolicyContext(context)).toMatchObject({
      valid: false,
      reason,
    });
  });

  it('denies bypass-bearing role authority', () => {
    const context = {
      ...buildValidUserContext(),
      authority: {
        ...buildValidUserContext().authority,
        rolePermissionConfig: { shouldBypassPermissionChecks: true },
      },
    };

    expect(validatePolicyContext(context)).toMatchObject({
      valid: false,
      reason: 'BYPASS_AUTHORITY_FORBIDDEN',
    });
  });

  it('denies an empty role set', () => {
    const context = {
      ...buildValidUserContext(),
      authority: {
        ...buildValidUserContext().authority,
        rolePermissionConfig: { unionOf: [] },
      },
    };

    expect(validatePolicyContext(context)).toMatchObject({
      valid: false,
      reason: 'AUTHORITY_UNRESOLVED',
    });
  });

  it('denies a service principal that attempts a write', () => {
    const validUserContext = buildValidUserContext();
    const context = {
      ...validUserContext,
      actor: {
        type: 'system',
        id: null,
        workspaceId: WORKSPACE_ID,
        serviceAuthorityId: 'workflow-bootstrap',
      },
      authority: {
        type: 'service',
        source: 'SCOPED_SERVICE_PRINCIPAL',
        workspaceId: WORKSPACE_ID,
        serviceAuthorityId: 'workflow-bootstrap',
        allowedOperations: ['workflow.configuration.read'],
        maximumRiskClass: 'R0',
        authorityVersion: 'workflow-bootstrap:1',
        revocationState: 'ACTIVE',
        evaluatedAt: '2026-09-01T12:00:00.000Z',
      },
      operation: 'record.update',
      riskClass: 'R1',
    };

    expect(validatePolicyContext(context)).toMatchObject({
      valid: false,
      reason: 'SERVICE_RISK_FORBIDDEN',
    });
  });

  it('accepts an explicit service-mutation authority for one R1 operation', () => {
    const validUserContext = buildValidUserContext();
    const context = {
      ...validUserContext,
      actor: {
        type: 'system',
        id: null,
        workspaceId: WORKSPACE_ID,
        serviceAuthorityId: 'emailing-delivery-webhook',
      },
      authority: {
        type: 'serviceMutation',
        source: 'SCOPED_SERVICE_PRINCIPAL',
        workspaceId: WORKSPACE_ID,
        serviceAuthorityId: 'emailing-delivery-webhook',
        allowedOperations: ['campaign.delivery-status.update'],
        maximumRiskClass: 'R1',
        authorityVersion: 'emailing-delivery-webhook:1',
        revocationState: 'ACTIVE',
        evaluatedAt: '2026-09-01T12:00:00.000Z',
      },
      operation: 'campaign.delivery-status.update',
      riskClass: 'R1',
    };

    expect(validatePolicyContext(context)).toMatchObject({ valid: true });
  });

  it('denies R2 for an R1 service-mutation authority', () => {
    const validUserContext = buildValidUserContext();
    const context = {
      ...validUserContext,
      actor: {
        type: 'system',
        id: null,
        workspaceId: WORKSPACE_ID,
        serviceAuthorityId: 'emailing-delivery-webhook',
      },
      authority: {
        type: 'serviceMutation',
        source: 'SCOPED_SERVICE_PRINCIPAL',
        workspaceId: WORKSPACE_ID,
        serviceAuthorityId: 'emailing-delivery-webhook',
        allowedOperations: ['campaign.delivery-status.update'],
        maximumRiskClass: 'R1',
        authorityVersion: 'emailing-delivery-webhook:1',
        revocationState: 'ACTIVE',
        evaluatedAt: '2026-09-01T12:00:00.000Z',
      },
      operation: 'campaign.delivery-status.update',
      riskClass: 'R2',
    };

    expect(validatePolicyContext(context)).toMatchObject({
      valid: false,
      reason: 'SERVICE_RISK_FORBIDDEN',
    });
  });

  it('denies unknown context fields', () => {
    const context = {
      ...buildValidUserContext(),
      shouldBypassPermissionChecks: true,
    };

    expect(validatePolicyContext(context)).toMatchObject({
      valid: false,
      reason: 'POLICY_CONTEXT_MALFORMED',
    });
  });
});
