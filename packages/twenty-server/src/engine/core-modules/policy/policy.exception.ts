export enum PolicyExceptionCode {
  BYPASS_FORBIDDEN = 'BYPASS_FORBIDDEN',
  CONTEXT_INVALID = 'CONTEXT_INVALID',
  DECISION_INVALID = 'DECISION_INVALID',
}

export class PolicyException extends Error {
  constructor(
    message: string,
    public readonly code: PolicyExceptionCode,
  ) {
    super(message);
  }
}
