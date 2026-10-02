import { PolicyAuditService } from 'src/engine/core-modules/policy/services/policy-audit.service';
import { ProtectedOperationService } from 'src/engine/core-modules/policy/services/protected-operation.service';
import { type PolicyContext } from 'src/engine/core-modules/policy/types/policy-context.type';
import { type PolicyDecision } from 'src/engine/core-modules/policy/types/policy-decision.type';
import { buildPolicyContextDigest } from 'src/engine/core-modules/policy/utils/build-policy-context-digest.util';

const WORKSPACE_ID = '20202020-1111-4111-8111-111111111111';
const ACTOR_ID = '20202020-2222-4222-8222-222222222222';
const WORKSPACE_MEMBER_ID = '20202020-3333-4333-8333-333333333333';
const ROLE_ID = '20202020-4444-4444-8444-444444444444';
const DECISION_ID = '20202020-5555-4555-8555-555555555555';
const ROOT_CORRELATION_ID = '20202020-6666-4666-8666-666666666666';
const ATTEMPT_ID = '20202020-7777-4777-8777-777777777777';
const EFFECT_ID = '20202020-8888-4888-8888-888888888888';

const buildContext = (
  riskClass: PolicyContext['riskClass'],
): PolicyContext => ({
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
  riskClass,
  target: {
    workspaceId: WORKSPACE_ID,
    resourceType: 'objectRecord',
  },
  affectedFieldMetadataIds: [],
  correlation: {
    rootCorrelationId: ROOT_CORRELATION_ID,
    decisionId: DECISION_ID,
    attemptId: ATTEMPT_ID,
    mutationOrEffectId: EFFECT_ID,
  },
});

const buildDecision = (
  context: PolicyContext,
  outcome: PolicyDecision['outcome'],
): PolicyDecision => ({
  schemaVersion: 1,
  id: DECISION_ID,
  workspaceId: WORKSPACE_ID,
  contextDigest: buildPolicyContextDigest(context),
  outcome,
  reasonCodes: outcome === 'ALLOW' ? ['AUTHORIZED'] : ['ROLE_DENIED'],
  policyVersion: 'p0-v1',
  riskClass: context.riskClass,
  evaluatedAt: '2026-09-01T12:00:00.000Z',
  correlation: context.correlation,
});

describe('ProtectedOperationService', () => {
  let auditService: jest.Mocked<Pick<PolicyAuditService, 'append'>>;
  let service: ProtectedOperationService;
  const telemetryService = {
    recordAuditUnavailable: jest.fn(),
    recordDecision: jest.fn(),
    recordReconciliationRequired: jest.fn(),
  };

  beforeEach(() => {
    auditService = { append: jest.fn() };
    service = new ProtectedOperationService(
      auditService as unknown as PolicyAuditService,
      telemetryService as never,
    );
  });

  it('orders decision, intent, effect, and outcome for an allowed R2 action', async () => {
    const order: string[] = [];
    const context = buildContext('R2');
    const execute = jest.fn(async () => {
      order.push('effect');
      return { providerReference: 'provider-result' };
    });

    auditService.append.mockImplementation(async (event) => {
      order.push(event.phase);
      return {} as never;
    });

    await expect(
      service.execute({
        context,
        decision: buildDecision(context, 'ALLOW'),
        auditMetadata: {},
        execute,
      }),
    ).resolves.toMatchObject({
      status: 'SUCCEEDED',
      value: { providerReference: 'provider-result' },
      policyDecisionId: DECISION_ID,
    });
    expect(order).toEqual(['DECISION', 'INTENT', 'effect', 'OUTCOME']);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('does not execute when the policy decision denies', async () => {
    const context = buildContext('R1');
    const execute = jest.fn();

    auditService.append.mockResolvedValue({} as never);

    await expect(
      service.execute({
        context,
        decision: buildDecision(context, 'DENY'),
        auditMetadata: {},
        execute,
      }),
    ).resolves.toMatchObject({
      status: 'DENIED',
      policyDecisionId: DECISION_ID,
      reasonCodes: ['ROLE_DENIED'],
    });
    expect(execute).not.toHaveBeenCalled();
    expect(auditService.append).toHaveBeenCalledTimes(1);
  });

  it('blocks an R3 action when durable intent persistence fails', async () => {
    const context = buildContext('R3');
    const execute = jest.fn();

    auditService.append
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(new Error('primary audit unavailable'));

    await expect(
      service.execute({
        context,
        decision: buildDecision(context, 'ALLOW'),
        auditMetadata: {},
        execute,
      }),
    ).resolves.toMatchObject({
      status: 'DENIED',
      reasonCodes: ['AUDIT_UNAVAILABLE'],
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('returns reconciliation-required when outcome persistence fails after effect', async () => {
    const context = buildContext('R2');
    const execute = jest.fn().mockResolvedValue('sent');

    auditService.append
      .mockResolvedValueOnce({} as never)
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce(new Error('outcome audit unavailable'));

    await expect(
      service.execute({
        context,
        decision: buildDecision(context, 'ALLOW'),
        auditMetadata: {},
        execute,
      }),
    ).resolves.toMatchObject({
      status: 'RECONCILIATION_REQUIRED',
      policyDecisionId: DECISION_ID,
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('rejects a decision that is not bound to the supplied context', async () => {
    const context = buildContext('R2');
    const execute = jest.fn();
    const decision = {
      ...buildDecision(context, 'ALLOW'),
      contextDigest: 'b'.repeat(64),
    };

    await expect(
      service.execute({ context, decision, auditMetadata: {}, execute }),
    ).rejects.toThrow('Policy decision is not bound to the supplied context.');
    expect(auditService.append).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });
});
