import { ResumeDelayedWorkflowJob } from 'src/modules/workflow/workflow-executor/workflow-actions/delay/jobs/resume-delayed-workflow.job';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const WORKFLOW_RUN_ID = '22222222-2222-4222-8222-222222222222';

describe('ResumeDelayedWorkflowJob policy boundary', () => {
  const workspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(),
  };
  const applicationService = {
    findTwentyStandardApplicationOrThrow: jest.fn(),
    findApplicationRoleId: jest.fn(),
  };
  const job = new ResumeDelayedWorkflowJob(
    applicationService as never,
    {} as never,
    {} as never,
    workspaceOrmManager as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('denies before opening workspace context when queue identity is absent', async () => {
    await expect(
      job.handle(
        {
          workspaceId: WORKSPACE_ID,
          workflowRunId: WORKFLOW_RUN_ID,
          stepId: 'step-1',
          policySchemaVersion: 1,
          rootCorrelationId: WORKFLOW_RUN_ID,
        },
        {},
      ),
    ).rejects.toThrow(
      'Protected delayed workflow job identity is missing or mismatched.',
    );

    expect(
      workspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
  });

  it('denies before opening workspace context when application authority is unresolved', async () => {
    applicationService.findTwentyStandardApplicationOrThrow.mockResolvedValue({
      application: { id: '33333333-3333-4333-8333-333333333333' },
      workspace: { id: WORKSPACE_ID },
    });
    applicationService.findApplicationRoleId.mockRejectedValue(
      new Error('Application role not found'),
    );

    await expect(
      job.handle(
        {
          workspaceId: WORKSPACE_ID,
          workflowRunId: WORKFLOW_RUN_ID,
          stepId: 'step-1',
          policySchemaVersion: 1,
          rootCorrelationId: WORKFLOW_RUN_ID,
        },
        { jobId: 'job-1', jobName: 'ResumeDelayedWorkflowJob' },
      ),
    ).rejects.toThrow('Application role not found');

    expect(
      workspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
  });
});
