import { validatePolicyAuditMetadata } from 'src/engine/core-modules/policy/utils/validate-policy-audit-metadata.util';

const SHA_256 = 'a'.repeat(64);

describe('validatePolicyAuditMetadata', () => {
  it('accepts the closed allowlist with bounded values', () => {
    const metadata = {
      targetCount: 2,
      argumentDigest: SHA_256,
      idempotencyKeyDigest: SHA_256,
      providerClass: 'transactional-email',
      providerReferenceDigest: SHA_256,
      correlationSource: 'SERVER_GENERATED',
      workflowVersionId: '20202020-1111-4111-8111-111111111111',
      replayOfAttemptId: '20202020-2222-4222-8222-222222222222',
      payloadSchemaVersion: 1,
      payloadDigest: SHA_256,
      payloadClassification: 'BUSINESS_RESTRICTED',
      approvalId: '20202020-3333-4333-8333-333333333333',
    };

    expect(validatePolicyAuditMetadata(metadata)).toEqual({
      valid: true,
      metadata,
    });
  });

  it.each([
    {
      name: 'unknown key',
      metadata: { rawArguments: 'sensitive' },
      reason: 'UNKNOWN_KEY',
    },
    {
      name: 'raw sentinel secret',
      metadata: { providerClass: 'SENTINEL_SECRET=top-secret' },
      reason: 'INVALID_VALUE',
    },
    {
      name: 'unbounded target count',
      metadata: { targetCount: 1_000_001 },
      reason: 'INVALID_VALUE',
    },
    {
      name: 'non-digest argument value',
      metadata: { argumentDigest: 'customer@example.com' },
      reason: 'INVALID_VALUE',
    },
    {
      name: 'unsupported correlation source',
      metadata: { correlationSource: 'MODEL_GENERATED' },
      reason: 'INVALID_VALUE',
    },
    {
      name: 'malformed approval identity',
      metadata: { approvalId: 'approval-from-model-output' },
      reason: 'INVALID_VALUE',
    },
  ])('rejects $name', ({ metadata, reason }) => {
    expect(validatePolicyAuditMetadata(metadata)).toMatchObject({
      valid: false,
      reason,
    });
  });

  it('rejects non-object metadata', () => {
    expect(validatePolicyAuditMetadata('secret')).toMatchObject({
      valid: false,
      reason: 'MALFORMED',
    });
  });
});
