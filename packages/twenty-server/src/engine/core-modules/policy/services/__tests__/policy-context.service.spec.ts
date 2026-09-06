import { PolicyExceptionCode } from 'src/engine/core-modules/policy/policy.exception';
import { PolicyContextService } from 'src/engine/core-modules/policy/services/policy-context.service';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';
const WORKSPACE_MEMBER_ID = '33333333-3333-4333-8333-333333333333';
const ROLE_ID = '44444444-4444-4444-8444-444444444444';
const ROOT_CORRELATION_ID = '55555555-5555-4555-8555-555555555555';
const DECISION_ID = '66666666-6666-4666-8666-666666666666';
const ATTEMPT_ID = '77777777-7777-4777-8777-777777777777';

const buildInput = () => ({
  workspaceId: WORKSPACE_ID,
  actor: {
    type: 'user' as const,
    id: ACTOR_ID,
    workspaceId: WORKSPACE_ID,
    workspaceMemberId: WORKSPACE_MEMBER_ID,
  },
  authority: {
    type: 'roles' as const,
    source: 'CALLER_BOUND' as const,
    workspaceId: WORKSPACE_ID,
    authorityVersion: 'role-version-1',
    revocationState: 'ACTIVE' as const,
    evaluatedAt: '2026-09-01T00:00:00.000Z',
    rolePermissionConfig: { unionOf: [ROLE_ID] },
  },
  operation: 'record.update',
  riskClass: 'R1' as const,
  target: {
    workspaceId: WORKSPACE_ID,
    resourceType: 'record',
    resourceId: ACTOR_ID,
  },
  affectedFieldMetadataIds: [],
  correlation: {
    rootCorrelationId: ROOT_CORRELATION_ID,
    decisionId: DECISION_ID,
    attemptId: ATTEMPT_ID,
  },
});

describe('PolicyContextService', () => {
  const service = new PolicyContextService();

  it('creates a frozen, versioned context from validated server state', () => {
    const context = service.create(buildInput());

    expect(context).toMatchObject({
      schemaVersion: 1,
      policyVersion: 'p0-v1',
      workspaceId: WORKSPACE_ID,
      operation: 'record.update',
    });
    expect(Object.isFrozen(context)).toBe(true);
  });

  it('rejects a bypass-bearing authority', () => {
    const input = buildInput();

    expect(() =>
      service.create({
        ...input,
        authority: {
          ...input.authority,
          rolePermissionConfig: { shouldBypassPermissionChecks: true },
        } as never,
      }),
    ).toThrow(
      expect.objectContaining({ code: PolicyExceptionCode.BYPASS_FORBIDDEN }),
    );
  });

  it('rejects cross-workspace authority before returning a context', () => {
    const input = buildInput();

    expect(() =>
      service.create({
        ...input,
        authority: {
          ...input.authority,
          workspaceId: '88888888-8888-4888-8888-888888888888',
        },
      }),
    ).toThrow(
      expect.objectContaining({ code: PolicyExceptionCode.CONTEXT_INVALID }),
    );
  });
});
