import { assertWorkflowExecutionTransition } from 'src/engine/core-modules/workflow-reliability/utils/assert-workflow-execution-transition.util';

describe('assertWorkflowExecutionTransition', () => {
  it.each([
    ['QUEUED', 'RUNNING'],
    ['RUNNING', 'SUCCEEDED'],
    ['RUNNING', 'RETRY_WAIT'],
    ['RUNNING', 'FAILED_PERMANENT'],
    ['RUNNING', 'DEAD_LETTERED'],
    ['RUNNING', 'CANCELLED'],
    ['RETRY_WAIT', 'QUEUED'],
    ['FAILED_PERMANENT', 'DEAD_LETTERED'],
  ] as const)('allows %s to %s', (from, to) => {
    expect(() => assertWorkflowExecutionTransition(from, to)).not.toThrow();
  });

  it.each([
    ['SUCCEEDED', 'QUEUED'],
    ['DEAD_LETTERED', 'RUNNING'],
    ['CANCELLED', 'RUNNING'],
    ['QUEUED', 'SUCCEEDED'],
  ] as const)('rejects %s to %s', (from, to) => {
    expect(() => assertWorkflowExecutionTransition(from, to)).toThrow(
      `Invalid workflow execution transition ${from} -> ${to}.`,
    );
  });
});
