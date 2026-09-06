import { PolicyCorrelationService } from 'src/engine/core-modules/policy/services/policy-correlation.service';

const ROOT_CORRELATION_ID = '11111111-1111-4111-8111-111111111111';

describe('PolicyCorrelationService', () => {
  const service = new PolicyCorrelationService();

  it('preserves a server-owned root and creates unique attempts and decisions', () => {
    const first = service.createAttempt({
      rootCorrelationId: ROOT_CORRELATION_ID,
    });
    const second = service.createAttempt({
      rootCorrelationId: ROOT_CORRELATION_ID,
    });

    expect(first.rootCorrelationId).toBe(ROOT_CORRELATION_ID);
    expect(second.rootCorrelationId).toBe(ROOT_CORRELATION_ID);
    expect(first.attemptId).not.toBe(second.attemptId);
    expect(first.decisionId).not.toBe(second.decisionId);
  });

  it('rejects a malformed propagated root', () => {
    expect(() =>
      service.createAttempt({ rootCorrelationId: 'untrusted-header-value' }),
    ).toThrow('Root correlation identifier must be a UUID.');
  });
});
