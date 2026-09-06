export type WorkflowExecutionState =
  | 'QUEUED'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'RETRY_WAIT'
  | 'FAILED_PERMANENT'
  | 'DEAD_LETTERED'
  | 'CANCELLED';
