export type RunWorkflowJobData = {
  workspaceId: string;
  workflowRunId: string;
  lastExecutedStepId?: string;
  stepIdsToRetry?: string[];
  policySchemaVersion: 1;
  originPolicyDecisionId?: string;
  approvalId?: string;
  rootCorrelationId: string;
};
