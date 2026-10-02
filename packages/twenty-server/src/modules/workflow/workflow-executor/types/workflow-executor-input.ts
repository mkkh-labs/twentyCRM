export type WorkflowPolicyTransportContext = {
  jobId: string;
  rootCorrelationId: string;
  originPolicyDecisionId?: string;
  approvalId?: string;
};

export type WorkflowExecutorInput = WorkflowPolicyTransportContext & {
  stepIds: string[];
  workflowRunId: string;
  workspaceId: string;
  shouldComputeWorkflowRunStatus?: boolean;
  executedStepsCount?: number;
};

export type WorkflowBranchExecutorInput = WorkflowPolicyTransportContext & {
  stepId: string;
  attemptCount?: number;
  workflowRunId: string;
  workspaceId: string;
  executedStepsCount?: number;
};
