type RunWorkflowJobDataBase = Readonly<{
  workspaceId: string;
  workflowRunId: string;
  policySchemaVersion: 1;
  originPolicyDecisionId?: string;
  approvalId?: string;
  rootCorrelationId: string;
}>;

export type RunWorkflowJobData =
  | (RunWorkflowJobDataBase &
      Readonly<{
        lastExecutedStepId?: never;
        stepIdsToRetry?: never;
      }>)
  | (RunWorkflowJobDataBase &
      Readonly<{
        lastExecutedStepId: string;
        stepIdsToRetry?: never;
      }>)
  | (RunWorkflowJobDataBase &
      Readonly<{
        lastExecutedStepId?: never;
        stepIdsToRetry: readonly string[];
      }>);
