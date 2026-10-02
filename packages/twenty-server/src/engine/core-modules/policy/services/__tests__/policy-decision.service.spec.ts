import { PolicyDecisionService } from 'src/engine/core-modules/policy/services/policy-decision.service';
import { type PolicyContext } from 'src/engine/core-modules/policy/types/policy-context.type';
import { buildPolicyContextDigest } from 'src/engine/core-modules/policy/utils/build-policy-context-digest.util';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const DECISION_ID = '66666666-6666-4666-8666-666666666666';

const context: PolicyContext = {
  schemaVersion: 1,
  policyVersion: 'p0-v1',
  workspaceId: WORKSPACE_ID,
  actor: {
    type: 'application',
    id: '22222222-2222-4222-8222-222222222222',
    workspaceId: WORKSPACE_ID,
  },
  authority: {
    type: 'roles',
    source: 'DELEGATED_APPLICATION',
    workspaceId: WORKSPACE_ID,
    authorityVersion: 'role-version-1',
    revocationState: 'ACTIVE',
    evaluatedAt: '2026-09-01T00:00:00.000Z',
    rolePermissionConfig: {
      unionOf: ['33333333-3333-4333-8333-333333333333'],
    },
  },
  operation: 'workflow.execute',
  riskClass: 'R2',
  target: {
    workspaceId: WORKSPACE_ID,
    resourceType: 'workflowRun',
    resourceId: '44444444-4444-4444-8444-444444444444',
  },
  affectedFieldMetadataIds: [],
  correlation: {
    rootCorrelationId: '55555555-5555-4555-8555-555555555555',
    decisionId: DECISION_ID,
    attemptId: '77777777-7777-4777-8777-777777777777',
  },
};

describe('PolicyDecisionService', () => {
  const service = new PolicyDecisionService();

  it('binds an allow decision to the context and normalizes reasons', () => {
    const decision = service.create({
      context,
      outcome: 'ALLOW',
      reasonCodes: ['AUTHORIZED', 'AUTHORIZED'],
      evaluatedAt: '2026-09-01T00:00:01.000Z',
    });

    expect(decision).toEqual({
      schemaVersion: 1,
      id: DECISION_ID,
      workspaceId: WORKSPACE_ID,
      contextDigest: buildPolicyContextDigest(context),
      outcome: 'ALLOW',
      reasonCodes: ['AUTHORIZED'],
      policyVersion: 'p0-v1',
      riskClass: 'R2',
      evaluatedAt: '2026-09-01T00:00:01.000Z',
      correlation: context.correlation,
    });
  });

  it('rejects an allow decision without an authorized reason', () => {
    expect(() =>
      service.create({
        context,
        outcome: 'ALLOW',
        reasonCodes: ['ROLE_DENIED'],
      }),
    ).toThrow('Allow decisions require only the authorized reason.');
  });

  it('preserves a parent decision for retry lineage', () => {
    const decision = service.create({
      context,
      outcome: 'DENY',
      reasonCodes: ['AUTHORITY_REVOKED'],
      parentDecisionId: '88888888-8888-4888-8888-888888888888',
    });

    expect(decision.parentDecisionId).toBe(
      '88888888-8888-4888-8888-888888888888',
    );
  });
});
