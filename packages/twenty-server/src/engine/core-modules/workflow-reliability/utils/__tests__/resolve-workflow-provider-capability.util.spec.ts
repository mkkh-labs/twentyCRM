import { resolveWorkflowProviderCapability } from 'src/engine/core-modules/workflow-reliability/utils/resolve-workflow-provider-capability.util';

describe('resolveWorkflowProviderCapability', () => {
  it('rejects an unregistered provider', () => {
    expect(() =>
      resolveWorkflowProviderCapability({
        providerClass: 'mail',
        capabilities: [],
      }),
    ).toThrow('requires one explicit capability contract');
  });

  it('rejects automatic retries without provider idempotency', () => {
    expect(() =>
      resolveWorkflowProviderCapability({
        providerClass: 'mail',
        capabilities: [
          {
            providerClass: 'mail',
            supportsIdempotencyKey: false,
            supportsOutcomeReconciliation: false,
            maximumAutomaticAttempts: 2,
          },
        ],
      }),
    ).toThrow('cannot be retried automatically');
  });

  it('allows a single attempt when provider guarantees are absent', () => {
    expect(
      resolveWorkflowProviderCapability({
        providerClass: 'mail',
        capabilities: [
          {
            providerClass: 'mail',
            supportsIdempotencyKey: false,
            supportsOutcomeReconciliation: false,
            maximumAutomaticAttempts: 1,
          },
        ],
      }),
    ).toMatchObject({ maximumAutomaticAttempts: 1 });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 1.5])(
    'rejects malformed automatic-attempt limit %s',
    (maximumAutomaticAttempts) => {
      expect(() =>
        resolveWorkflowProviderCapability({
          providerClass: 'mail',
          capabilities: [
            {
              providerClass: 'mail',
              supportsIdempotencyKey: true,
              supportsOutcomeReconciliation: true,
              maximumAutomaticAttempts,
            },
          ],
        }),
      ).toThrow('positive safe-integer attempt limit');
    },
  );
});
