export type PolicySpanAttributes = Readonly<{
  'policy.outcome'?: 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL';
  'policy.risk_class'?: 'R0' | 'R1' | 'R2' | 'R3';
  'twenty.workspace.present'?: boolean;
  'twenty.user_workspace.present'?: boolean;
}>;

const validators: {
  [TKey in keyof PolicySpanAttributes]: (value: unknown) => boolean;
} = {
  'policy.outcome': (value) =>
    value === 'ALLOW' || value === 'DENY' || value === 'REQUIRE_APPROVAL',
  'policy.risk_class': (value) =>
    value === 'R0' || value === 'R1' || value === 'R2' || value === 'R3',
  'twenty.workspace.present': (value) => typeof value === 'boolean',
  'twenty.user_workspace.present': (value) => typeof value === 'boolean',
};

export const sanitizePolicySpanAttributes = (
  candidate: Readonly<Record<string, unknown>>,
): PolicySpanAttributes => {
  const sanitized: Record<string, boolean | string> = {};

  for (const [key, validator] of Object.entries(validators)) {
    const value = candidate[key];

    if (value !== undefined && validator(value)) {
      sanitized[key] = value as boolean | string;
    }
  }

  return sanitized;
};
