export const PolicyAuditExceptionCode = {
  EVENT_KEY_CONFLICT: 'EVENT_KEY_CONFLICT',
  INVALID_EVENT: 'INVALID_EVENT',
  SENSITIVE_METADATA_REJECTED: 'SENSITIVE_METADATA_REJECTED',
} as const;

export type PolicyAuditExceptionCode =
  (typeof PolicyAuditExceptionCode)[keyof typeof PolicyAuditExceptionCode];

export class PolicyAuditException extends Error {
  constructor(
    message: string,
    public readonly code: PolicyAuditExceptionCode,
  ) {
    super(message);
    this.name = PolicyAuditException.name;
  }
}
