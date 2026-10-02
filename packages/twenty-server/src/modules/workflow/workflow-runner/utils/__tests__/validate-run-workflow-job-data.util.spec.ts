import { validateRunWorkflowJobData } from 'src/modules/workflow/workflow-runner/utils/validate-run-workflow-job-data.util';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const WORKFLOW_RUN_ID = '22222222-2222-4222-8222-222222222222';
const ROOT_CORRELATION_ID = '33333333-3333-4333-8333-333333333333';
const STEP_ID = '44444444-4444-4444-8444-444444444444';
const POLICY_DECISION_ID = '55555555-5555-4555-8555-555555555555';
const APPROVAL_ID = '66666666-6666-4666-8666-666666666666';

const BASE_JOB_DATA = {
  workspaceId: WORKSPACE_ID,
  workflowRunId: WORKFLOW_RUN_ID,
  policySchemaVersion: 1,
  rootCorrelationId: ROOT_CORRELATION_ID,
} as const;

describe('validateRunWorkflowJobData', () => {
  it.each([
    ['start', BASE_JOB_DATA],
    [
      'resume',
      {
        ...BASE_JOB_DATA,
        lastExecutedStepId: STEP_ID,
      },
    ],
    [
      'retry',
      {
        ...BASE_JOB_DATA,
        stepIdsToRetry: [STEP_ID],
        originPolicyDecisionId: POLICY_DECISION_ID,
        approvalId: APPROVAL_ID,
      },
    ],
  ])('accepts an exact %s envelope', (_, value) => {
    expect(validateRunWorkflowJobData(value)).toBe(true);
  });

  it.each([
    ['extra key', { ...BASE_JOB_DATA, authorityBypass: true }],
    [
      'legacy payload',
      { workspaceId: WORKSPACE_ID, workflowRunId: WORKFLOW_RUN_ID },
    ],
    ['foreign schema', { ...BASE_JOB_DATA, policySchemaVersion: 2 }],
    ['malformed workspace', { ...BASE_JOB_DATA, workspaceId: 'workspace-1' }],
    ['malformed run', { ...BASE_JOB_DATA, workflowRunId: 'run-1' }],
    ['malformed root', { ...BASE_JOB_DATA, rootCorrelationId: 'root-1' }],
    [
      'malformed decision',
      { ...BASE_JOB_DATA, originPolicyDecisionId: 'decision-1' },
    ],
    ['malformed approval', { ...BASE_JOB_DATA, approvalId: 'approval-1' }],
    [
      'resume and retry state',
      {
        ...BASE_JOB_DATA,
        lastExecutedStepId: STEP_ID,
        stepIdsToRetry: [STEP_ID],
      },
    ],
    ['empty retry state', { ...BASE_JOB_DATA, stepIdsToRetry: [] }],
    [
      'malformed resume step',
      { ...BASE_JOB_DATA, lastExecutedStepId: 'step-1' },
    ],
    ['malformed retry step', { ...BASE_JOB_DATA, stepIdsToRetry: ['step-1'] }],
  ])('rejects an envelope with %s', (_, value) => {
    expect(validateRunWorkflowJobData(value)).toBe(false);
  });
});
