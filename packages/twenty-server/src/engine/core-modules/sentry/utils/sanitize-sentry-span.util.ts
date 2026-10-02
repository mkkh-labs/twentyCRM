import { type SpanAttributeValue, type SpanJSON } from '@sentry/core';

import { sanitizePolicySpanAttributes } from 'src/engine/core-modules/sentry/utils/sanitize-policy-span-attributes.util';

const SAFE_OPERATION_PATTERN = /^[a-z][a-z0-9_.-]{0,63}$/i;
const SAFE_HTTP_METHODS = new Set([
  'DELETE',
  'GET',
  'HEAD',
  'OPTIONS',
  'PATCH',
  'POST',
  'PUT',
]);

const sanitizeSpanData = (
  data: Readonly<Record<string, SpanAttributeValue | undefined>>,
): Record<string, SpanAttributeValue> => {
  const sanitized: Record<string, SpanAttributeValue> = {
    ...sanitizePolicySpanAttributes(data),
  };
  const method = data['http.request.method'];
  const statusCode = data['http.response.status_code'];

  if (typeof method === 'string' && SAFE_HTTP_METHODS.has(method)) {
    sanitized['http.request.method'] = method;
  }

  if (
    typeof statusCode === 'number' &&
    Number.isInteger(statusCode) &&
    statusCode >= 100 &&
    statusCode <= 599
  ) {
    sanitized['http.response.status_code'] = statusCode;
  }

  return sanitized;
};

export const sanitizeSentrySpan = (
  span: SpanJSON,
  context: Readonly<{
    workspacePresent: boolean;
    userWorkspacePresent: boolean;
  }>,
): SpanJSON => {
  const operation =
    span.op && SAFE_OPERATION_PATTERN.test(span.op) ? span.op : undefined;
  const data = sanitizeSpanData({
    ...span.data,
    'twenty.workspace.present': context.workspacePresent,
    'twenty.user_workspace.present': context.userWorkspacePresent,
  });

  return {
    trace_id: span.trace_id,
    parent_span_id: span.parent_span_id,
    span_id: span.span_id,
    start_timestamp: span.start_timestamp,
    timestamp: span.timestamp,
    status: span.status,
    op: operation,
    description: operation ?? 'operation',
    origin: span.origin,
    exclusive_time: span.exclusive_time,
    is_segment: span.is_segment,
    segment_id: span.segment_id,
    data,
  };
};
