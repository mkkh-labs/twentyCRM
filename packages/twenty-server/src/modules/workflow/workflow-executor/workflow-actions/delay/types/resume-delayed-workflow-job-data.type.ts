export type ResumeDelayedWorkflowJobData = {
  workspaceId: string;
  workflowRunId: string;
  stepId: string;
  policySchemaVersion: 1;
  rootCorrelationId: string;
  originPolicyDecisionId?: string;
  approvalId?: string;
};
