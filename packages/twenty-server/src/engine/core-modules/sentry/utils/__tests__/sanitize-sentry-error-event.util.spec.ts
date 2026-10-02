import { type ErrorEvent } from '@sentry/node';

import { sanitizeSentryErrorEvent } from 'src/engine/core-modules/sentry/utils/sanitize-sentry-error-event.util';

describe('sanitizeSentryErrorEvent', () => {
  it('removes arbitrary customer, request, user, and exception content', () => {
    const sanitized = sanitizeSentryErrorEvent({
      event_id: 'event-id',
      type: undefined,
      message: 'SENTINEL_SECRET in customer record',
      transaction: '/people/SENTINEL_SECRET',
      request: {
        data: { prompt: 'SENTINEL_SECRET' },
        headers: { authorization: 'Bearer SENTINEL_SECRET' },
      },
      user: { email: 'SENTINEL_SECRET@example.com' },
      extra: { modelOutput: 'SENTINEL_SECRET' },
      breadcrumbs: [{ message: 'SENTINEL_SECRET' }],
      exception: {
        values: [
          {
            type: 'PolicyDeniedError',
            value: 'SENTINEL_SECRET',
            stacktrace: {
              frames: [
                {
                  function: 'executePolicy',
                  lineno: 42,
                  vars: { token: 'SENTINEL_SECRET' },
                  context_line: 'throw new Error("SENTINEL_SECRET")',
                },
              ],
            },
          },
        ],
      },
      contexts: {
        trace: {
          trace_id: 'a'.repeat(32),
          span_id: 'b'.repeat(16),
          parent_span_id: 'c'.repeat(16),
          data: { modelInput: 'SENTINEL_SECRET' },
          tags: { customer: 'SENTINEL_SECRET' },
          links: [
            {
              trace_id: 'SENTINEL_SECRET',
              span_id: 'SENTINEL_SECRET',
            },
          ],
        },
        customer: { secret: 'SENTINEL_SECRET' },
      },
      tags: {
        'policy.outcome': 'DENY',
        customer: 'SENTINEL_SECRET',
      },
    } as ErrorEvent);

    expect(JSON.stringify(sanitized)).not.toContain('SENTINEL_SECRET');
    expect(sanitized).toMatchObject({
      event_id: 'event-id',
      exception: {
        values: [
          {
            type: 'PolicyDeniedError',
            value: '[redacted]',
            stacktrace: {
              frames: [{ function: 'executePolicy', lineno: 42 }],
            },
          },
        ],
      },
      contexts: {
        trace: {
          trace_id: 'a'.repeat(32),
          span_id: 'b'.repeat(16),
          parent_span_id: 'c'.repeat(16),
        },
      },
      tags: { 'policy.outcome': 'DENY' },
    });
  });
});
