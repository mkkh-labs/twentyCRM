import { type WorkflowExecutionState } from 'src/engine/core-modules/workflow-reliability/types/workflow-execution-state.type';

const ALLOWED_TRANSITIONS: Record<
  WorkflowExecutionState,
  readonly WorkflowExecutionState[]
> = {
  QUEUED: ['RUNNING', 'CANCELLED'],
  RUNNING: [
    'SUCCEEDED',
    'RETRY_WAIT',
    'FAILED_PERMANENT',
    'DEAD_LETTERED',
    'CANCELLED',
  ],
  RETRY_WAIT: ['QUEUED', 'CANCELLED', 'DEAD_LETTERED'],
  FAILED_PERMANENT: ['DEAD_LETTERED'],
  SUCCEEDED: [],
  DEAD_LETTERED: [],
  CANCELLED: [],
};

export const assertWorkflowExecutionTransition = (
  from: WorkflowExecutionState,
  to: WorkflowExecutionState,
): void => {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new Error(`Invalid workflow execution transition ${from} -> ${to}.`);
  }
};
