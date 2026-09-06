import { type SpanJSON } from '@sentry/core';

import { sanitizeSentrySpan } from 'src/engine/core-modules/sentry/utils/sanitize-sentry-span.util';

describe('sanitizeSentrySpan', () => {
  it('retains only bounded span metadata and removes descriptions and payloads', () => {
    const sanitized = sanitizeSentrySpan(
      {
        trace_id: 'a'.repeat(32),
        span_id: 'b'.repeat(16),
        start_timestamp: 1,
        timestamp: 2,
        op: 'http.server',
        description: 'POST /people/SENTINEL_SECRET?token=SENTINEL_SECRET',
        data: {
          'policy.outcome': 'DENY',
          'policy.risk_class': 'R3',
          'http.request.method': 'POST',
          'http.response.status_code': 403,
          'url.full': 'https://example.com?token=SENTINEL_SECRET',
          'db.statement': 'SELECT SENTINEL_SECRET',
          prompt: 'SENTINEL_SECRET',
        },
      } as SpanJSON,
      {
        workspacePresent: true,
        userWorkspacePresent: false,
      },
    );

    expect(JSON.stringify(sanitized)).not.toContain('SENTINEL_SECRET');
    expect(sanitized.description).toBe('http.server');
    expect(sanitized.data).toEqual({
      'http.request.method': 'POST',
      'http.response.status_code': 403,
      'policy.outcome': 'DENY',
      'policy.risk_class': 'R3',
      'twenty.workspace.present': true,
      'twenty.user_workspace.present': false,
    });
  });
});
