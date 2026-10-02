import { type PolicyContext } from 'src/engine/core-modules/policy/types/policy-context.type';
import { buildPolicyContextDigest } from 'src/engine/core-modules/policy/utils/build-policy-context-digest.util';

const buildContext = (): PolicyContext => ({
  schemaVersion: 1,
  policyVersion: 'p0-v1',
  workspaceId: '20202020-1111-4111-8111-111111111111',
  actor: {
    type: 'application',
    id: '20202020-2222-4222-8222-222222222222',
    workspaceId: '20202020-1111-4111-8111-111111111111',
  },
  authority: {
    type: 'roles',
    source: 'DELEGATED_APPLICATION',
    workspaceId: '20202020-1111-4111-8111-111111111111',
    rolePermissionConfig: {
      intersectionOf: [
        '20202020-4444-4444-8444-444444444444',
        '20202020-3333-4333-8333-333333333333',
      ],
    },
    authorityVersion: 'role-map:1',
    revocationState: 'ACTIVE',
    evaluatedAt: '2026-09-01T12:00:00.000Z',
  },
  operation: 'record.update',
  riskClass: 'R1',
  target: {
    workspaceId: '20202020-1111-4111-8111-111111111111',
    resourceType: 'objectRecord',
    recordIds: [
      '20202020-6666-4666-8666-666666666666',
      '20202020-5555-4555-8555-555555555555',
    ],
  },
  affectedFieldMetadataIds: [
    '20202020-8888-4888-8888-888888888888',
    '20202020-7777-4777-8777-777777777777',
  ],
  correlation: {
    rootCorrelationId: '20202020-9999-4999-8999-999999999999',
    decisionId: '20202020-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    attemptId: '20202020-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  },
});

describe('buildPolicyContextDigest', () => {
  it('returns a lowercase SHA-256 digest', () => {
    expect(buildPolicyContextDigest(buildContext())).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is stable across object-key and set ordering', () => {
    const context = buildContext();
    const reorderedContext = {
      correlation: context.correlation,
      affectedFieldMetadataIds: [...context.affectedFieldMetadataIds].reverse(),
      target: {
        ...context.target,
        recordIds: [...(context.target.recordIds ?? [])].reverse(),
      },
      riskClass: context.riskClass,
      operation: context.operation,
      authority: {
        ...context.authority,
        rolePermissionConfig: {
          intersectionOf:
            context.authority.type === 'roles' &&
            'intersectionOf' in context.authority.rolePermissionConfig
              ? [
                  ...context.authority.rolePermissionConfig.intersectionOf,
                ].reverse()
              : [],
        },
      },
      actor: context.actor,
      workspaceId: context.workspaceId,
      policyVersion: context.policyVersion,
      schemaVersion: context.schemaVersion,
    } as PolicyContext;

    expect(buildPolicyContextDigest(reorderedContext)).toBe(
      buildPolicyContextDigest(context),
    );
  });

  it('changes when the protected target changes', () => {
    const context = buildContext();

    expect(
      buildPolicyContextDigest({
        ...context,
        target: {
          ...context.target,
          resourceId: '20202020-cccc-4ccc-8ccc-cccccccccccc',
        },
      }),
    ).not.toBe(buildPolicyContextDigest(context));
  });
});
