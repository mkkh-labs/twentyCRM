import { StepStatus } from 'twenty-shared/workflow';

import { WorkflowRunStatus } from 'src/modules/workflow/common/standard-objects/workflow-run.workspace-entity';
import { WorkflowRunnerWorkspaceService } from 'src/modules/workflow/workflow-runner/workspace-services/workflow-runner.workspace-service';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const WORKFLOW_RUN_ID = '22222222-2222-4222-8222-222222222222';
const APPROVAL_ID = '33333333-3333-4333-8333-333333333333';
const ROOT_CORRELATION_ID = '44444444-4444-4444-8444-444444444444';
const ORIGIN_POLICY_DECISION_ID = '55555555-5555-4555-8555-555555555555';

describe('WorkflowRunnerWorkspaceService approval retry', () => {
  const workflowRunWorkspaceService = {
    getWorkflowRunOrFail: jest.fn(),
    updateWorkflowRun: jest.fn(),
  };
  const messageQueueService = { add: jest.fn() };
  const service = new WorkflowRunnerWorkspaceService(
    workflowRunWorkspaceService as never,
    {} as never,
    messageQueueService as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => jest.resetAllMocks());

  it('retries only the exact approval-blocked workflow step', async () => {
    const workflowRun = {
      id: WORKFLOW_RUN_ID,
      status: WorkflowRunStatus.FAILED,
      endedAt: new Date('2026-09-04T00:00:00.000Z'),
      state: {
        flow: {
          steps: [
            { id: 'step-1', type: 'CODE' },
            { id: 'step-2', type: 'CODE' },
          ],
        },
        stepInfos: {
          'step-1': {
            status: StepStatus.FAILED,
            error: 'APPROVAL_REQUIRED',
          },
          'step-2': {
            status: StepStatus.FAILED,
            error: 'provider failure',
          },
        },
        workflowRunError: 'WorkflowRun failed',
      },
    };

    workflowRunWorkspaceService.getWorkflowRunOrFail.mockResolvedValue(
      workflowRun,
    );

    await expect(
      service.retryWorkflowStepWithApproval({
        workspaceId: WORKSPACE_ID,
        workflowRunId: WORKFLOW_RUN_ID,
        workflowStepId: 'step-1',
        approvalId: APPROVAL_ID,
        rootCorrelationId: ROOT_CORRELATION_ID,
        originPolicyDecisionId: ORIGIN_POLICY_DECISION_ID,
      }),
    ).resolves.toMatchObject({ status: WorkflowRunStatus.RUNNING });

    expect(workflowRunWorkspaceService.updateWorkflowRun).toHaveBeenCalledWith(
      expect.objectContaining({
        partialUpdate: expect.objectContaining({
          status: WorkflowRunStatus.RUNNING,
          state: expect.objectContaining({
            stepInfos: {
              ...workflowRun.state.stepInfos,
              'step-1': { status: StepStatus.NOT_STARTED },
            },
          }),
        }),
      }),
    );
    expect(messageQueueService.add).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        workflowRunId: WORKFLOW_RUN_ID,
        stepIdsToRetry: ['step-1'],
        approvalId: APPROVAL_ID,
        rootCorrelationId: ROOT_CORRELATION_ID,
        originPolicyDecisionId: ORIGIN_POLICY_DECISION_ID,
      }),
      expect.any(Object),
    );
  });

  it('refuses to retry a step that did not fail for approval', async () => {
    workflowRunWorkspaceService.getWorkflowRunOrFail.mockResolvedValue({
      id: WORKFLOW_RUN_ID,
      status: WorkflowRunStatus.FAILED,
      state: {
        flow: { steps: [{ id: 'step-1', type: 'CODE' }] },
        stepInfos: {
          'step-1': {
            status: StepStatus.FAILED,
            error: 'provider failure',
          },
        },
      },
    });

    await expect(
      service.retryWorkflowStepWithApproval({
        workspaceId: WORKSPACE_ID,
        workflowRunId: WORKFLOW_RUN_ID,
        workflowStepId: 'step-1',
        approvalId: APPROVAL_ID,
        rootCorrelationId: ROOT_CORRELATION_ID,
        originPolicyDecisionId: ORIGIN_POLICY_DECISION_ID,
      }),
    ).rejects.toThrow('not awaiting approval');
    expect(messageQueueService.add).not.toHaveBeenCalled();
  });
});
