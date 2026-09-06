import { RunWorkflowJob } from 'src/modules/workflow/workflow-runner/jobs/run-workflow.job';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const WORKFLOW_RUN_ID = '22222222-2222-4222-8222-222222222222';
const ROOT_CORRELATION_ID = '55555555-5555-4555-8555-555555555555';

describe('RunWorkflowJob policy boundary', () => {
  const workspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(),
  };
  const applicationService = {
    findTwentyStandardApplicationOrThrow: jest.fn(),
    findApplicationRoleId: jest.fn(),
  };
  const job = new RunWorkflowJob(
    applicationService as never,
    {} as never,
    {} as never,
    {} as never,
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
          policySchemaVersion: 1,
          rootCorrelationId: WORKFLOW_RUN_ID,
        },
        {},
      ),
    ).rejects.toThrow(
      'Protected workflow job identity is missing or mismatched.',
    );

    expect(
      workspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
  });

  it('denies before opening workspace context when the queue name is wrong', async () => {
    await expect(
      job.handle(
        {
          workspaceId: WORKSPACE_ID,
          workflowRunId: WORKFLOW_RUN_ID,
          policySchemaVersion: 1,
          rootCorrelationId: WORKFLOW_RUN_ID,
        },
        { jobId: 'job-1', jobName: 'OtherJob' },
      ),
    ).rejects.toThrow(
      'Protected workflow job identity is missing or mismatched.',
    );

    expect(
      workspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
  });

  it('preserves an origin root while denying unresolved application authority', async () => {
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
          policySchemaVersion: 1,
          rootCorrelationId: ROOT_CORRELATION_ID,
        },
        { jobId: 'job-1', jobName: 'RunWorkflowJob' },
      ),
    ).rejects.toThrow('Application role not found');
    expect(
      workspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
  });
});
