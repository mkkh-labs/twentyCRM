import { isDefined, isPlainObject, isValidUuid } from 'twenty-shared/utils';

import { type RunWorkflowJobData } from 'src/modules/workflow/workflow-runner/types/run-workflow-job-data.type';

const RUN_WORKFLOW_JOB_KEYS = new Set([
  'workspaceId',
  'workflowRunId',
  'lastExecutedStepId',
  'stepIdsToRetry',
  'policySchemaVersion',
  'originPolicyDecisionId',
  'approvalId',
  'rootCorrelationId',
]);

const hasOnlyRunWorkflowJobKeys = (value: Record<string, unknown>) =>
  Object.keys(value).every((key) => RUN_WORKFLOW_JOB_KEYS.has(key));

const isOptionalUuid = (value: unknown) =>
  !isDefined(value) || (typeof value === 'string' && isValidUuid(value));

export const validateRunWorkflowJobData = (
  value: unknown,
): value is RunWorkflowJobData => {
  if (
    !isPlainObject(value) ||
    !hasOnlyRunWorkflowJobKeys(value) ||
    value.policySchemaVersion !== 1 ||
    typeof value.workspaceId !== 'string' ||
    !isValidUuid(value.workspaceId) ||
    typeof value.workflowRunId !== 'string' ||
    !isValidUuid(value.workflowRunId) ||
    typeof value.rootCorrelationId !== 'string' ||
    !isValidUuid(value.rootCorrelationId) ||
    !isOptionalUuid(value.originPolicyDecisionId) ||
    !isOptionalUuid(value.approvalId)
  ) {
    return false;
  }

  const hasResumeState = isDefined(value.lastExecutedStepId);
  const hasRetryState = isDefined(value.stepIdsToRetry);

  if (hasResumeState && hasRetryState) {
    return false;
  }

  if (
    hasResumeState &&
    (typeof value.lastExecutedStepId !== 'string' ||
      !isValidUuid(value.lastExecutedStepId))
  ) {
    return false;
  }

  if (
    hasRetryState &&
    (!Array.isArray(value.stepIdsToRetry) ||
      value.stepIdsToRetry.length === 0 ||
      value.stepIdsToRetry.length > 1_000 ||
      !value.stepIdsToRetry.every(
        (stepId) => typeof stepId === 'string' && isValidUuid(stepId),
      ) ||
      new Set(value.stepIdsToRetry).size !== value.stepIdsToRetry.length)
  ) {
    return false;
  }

  return true;
};
