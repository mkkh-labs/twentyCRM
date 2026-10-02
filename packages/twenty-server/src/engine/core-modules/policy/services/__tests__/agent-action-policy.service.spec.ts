import { AgentActionPolicyService } from 'src/engine/core-modules/policy/services/agent-action-policy.service';

const ACTION_DIGEST = 'a'.repeat(64);

describe('AgentActionPolicyService', () => {
  const service = new AgentActionPolicyService();
  const input = {
    riskClass: 'R2' as const,
    workspaceId: '11111111-1111-4111-8111-111111111111',
    actorId: '22222222-2222-4222-8222-222222222222',
    actionDigest: ACTION_DIGEST,
    roleAllowed: true,
    automationAllowed: true,
    globalWritesEnabled: true,
    workspaceWritesEnabled: true,
    evaluatedAt: '2026-09-01T00:00:00.000Z',
  };

  it('requires approval for material actions', () => {
    expect(service.evaluate(input)).toEqual({
      outcome: 'REQUIRE_APPROVAL',
      reasonCodes: ['APPROVAL_REQUIRED'],
    });
  });

  it('allows only an active exact-bound approval', () => {
    expect(
      service.evaluate({
        ...input,
        approval: {
          id: '33333333-3333-4333-8333-333333333333',
          workspaceId: input.workspaceId,
          actorId: input.actorId,
          actionDigest: ACTION_DIGEST,
          approverId: '44444444-4444-4444-8444-444444444444',
          expiresAt: '2026-09-01T00:05:00.000Z',
          consumedAt: null,
        },
      }),
    ).toEqual({ outcome: 'ALLOW', reasonCodes: ['AUTHORIZED'] });
  });

  it.each([
    ['expired', { expiresAt: '2026-08-31T23:59:59.000Z' }, 'APPROVAL_EXPIRED'],
    ['reused', { consumedAt: '2026-08-31T23:59:59.000Z' }, 'APPROVAL_REUSED'],
    ['tampered', { actionDigest: 'b'.repeat(64) }, 'APPROVAL_MISMATCH'],
  ] as const)('denies an %s approval', (_label, approvalOverride, reason) => {
    expect(
      service.evaluate({
        ...input,
        approval: {
          id: '33333333-3333-4333-8333-333333333333',
          workspaceId: input.workspaceId,
          actorId: input.actorId,
          actionDigest: ACTION_DIGEST,
          approverId: '44444444-4444-4444-8444-444444444444',
          expiresAt: '2026-09-01T00:05:00.000Z',
          consumedAt: null,
          ...approvalOverride,
        },
      }),
    ).toEqual({ outcome: 'DENY', reasonCodes: [reason] });
  });

  it('makes role denial win over a valid approval', () => {
    expect(service.evaluate({ ...input, roleAllowed: false })).toEqual({
      outcome: 'DENY',
      reasonCodes: ['ROLE_DENIED'],
    });
  });

  it('enforces write kill switches without disabling reads', () => {
    expect(
      service.evaluate({
        ...input,
        riskClass: 'R1',
        globalWritesEnabled: false,
      }),
    ).toEqual({ outcome: 'DENY', reasonCodes: ['KILL_SWITCH_ACTIVE'] });
    expect(
      service.evaluate({
        ...input,
        riskClass: 'R0',
        globalWritesEnabled: false,
      }),
    ).toEqual({ outcome: 'ALLOW', reasonCodes: ['AUTHORIZED'] });
  });
});
