import { sanitizePolicySpanAttributes } from 'src/engine/core-modules/sentry/utils/sanitize-policy-span-attributes.util';

describe('sanitizePolicySpanAttributes', () => {
  it('retains only bounded policy telemetry fields', () => {
    expect(
      sanitizePolicySpanAttributes({
        'policy.outcome': 'DENY',
        'policy.risk_class': 'R3',
        'twenty.workspace.present': true,
        'twenty.user_workspace.present': false,
        prompt: 'SENTINEL_SECRET',
        'db.statement': 'select * from customer',
      }),
    ).toEqual({
      'policy.outcome': 'DENY',
      'policy.risk_class': 'R3',
      'twenty.workspace.present': true,
      'twenty.user_workspace.present': false,
    });
  });

  it('rejects invalid values for allowlisted keys', () => {
    expect(
      sanitizePolicySpanAttributes({
        'policy.outcome': 'SENTINEL_SECRET',
        'policy.risk_class': 'R9',
        'twenty.workspace.present': 'true',
      }),
    ).toEqual({});
  });
});
