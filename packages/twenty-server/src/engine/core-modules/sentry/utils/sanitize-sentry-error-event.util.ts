import { type ErrorEvent, type StackFrame } from '@sentry/node';

import { sanitizePolicySpanAttributes } from 'src/engine/core-modules/sentry/utils/sanitize-policy-span-attributes.util';

const sanitizeStackFrame = (frame: StackFrame): StackFrame => ({
  function: frame.function,
  module: frame.module,
  platform: frame.platform,
  lineno: frame.lineno,
  colno: frame.colno,
  in_app: frame.in_app,
});

const TRACE_ID_PATTERN = /^[a-f0-9]{32}$/i;
const SPAN_ID_PATTERN = /^[a-f0-9]{16}$/i;

type SentryTraceContext = NonNullable<ErrorEvent['contexts']>['trace'];

const sanitizeTraceContext = (
  traceContext: SentryTraceContext,
): SentryTraceContext => {
  if (
    traceContext === undefined ||
    !TRACE_ID_PATTERN.test(traceContext.trace_id) ||
    !SPAN_ID_PATTERN.test(traceContext.span_id)
  ) {
    return undefined;
  }

  return {
    trace_id: traceContext.trace_id,
    span_id: traceContext.span_id,
    ...(typeof traceContext.parent_span_id === 'string' &&
    SPAN_ID_PATTERN.test(traceContext.parent_span_id)
      ? { parent_span_id: traceContext.parent_span_id }
      : {}),
  };
};

export const sanitizeSentryErrorEvent = (event: ErrorEvent): ErrorEvent => {
  const traceContext = sanitizeTraceContext(event.contexts?.trace);

  return {
    type: undefined,
    event_id: event.event_id,
    timestamp: event.timestamp,
    level: event.level,
    platform: event.platform,
    release: event.release,
    dist: event.dist,
    environment: event.environment,
    sdk: event.sdk,
    exception: event.exception?.values
      ? {
          values: event.exception.values.map((exception) => ({
            type: exception.type,
            value: '[redacted]',
            stacktrace: exception.stacktrace
              ? {
                  frames: exception.stacktrace.frames?.map(sanitizeStackFrame),
                  frames_omitted: exception.stacktrace.frames_omitted,
                }
              : undefined,
          })),
        }
      : undefined,
    contexts: traceContext === undefined ? undefined : { trace: traceContext },
    tags: sanitizePolicySpanAttributes(event.tags ?? {}),
  };
};
