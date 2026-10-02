import { RunWorkflowJob } from 'src/modules/workflow/workflow-runner/jobs/run-workflow.job';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const WORKFLOW_RUN_ID = '22222222-2222-4222-8222-222222222222';
const ROOT_CORRELATION_ID = '55555555-5555-4555-8555-555555555555';
const STEP_ID = '66666666-6666-4666-8666-666666666666';
const QUEUE_JOB_ID = `${WORKFLOW_RUN_ID}-77777777-7777-4777-8777-777777777777`;

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
        { jobId: QUEUE_JOB_ID, jobName: 'OtherJob' },
      ),
    ).rejects.toThrow(
      'Protected workflow job identity is missing or mismatched.',
    );

    expect(
      workspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
  });

  it.each([
    [
      'an extra key',
      {
        workspaceId: WORKSPACE_ID,
        workflowRunId: WORKFLOW_RUN_ID,
        policySchemaVersion: 1,
        rootCorrelationId: WORKFLOW_RUN_ID,
        authorityBypass: true,
      },
    ],
    [
      'simultaneous resume and retry state',
      {
        workspaceId: WORKSPACE_ID,
        workflowRunId: WORKFLOW_RUN_ID,
        policySchemaVersion: 1,
        rootCorrelationId: WORKFLOW_RUN_ID,
        lastExecutedStepId: STEP_ID,
        stepIdsToRetry: [STEP_ID],
      },
    ],
  ])('denies %s before authority lookup', async (_, data) => {
    await expect(
      job.handle(data as never, {
        jobId: QUEUE_JOB_ID,
        jobName: 'RunWorkflowJob',
      }),
    ).rejects.toThrow('Protected workflow job envelope is invalid.');

    expect(
      applicationService.findTwentyStandardApplicationOrThrow,
    ).not.toHaveBeenCalled();
    expect(
      workspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
  });

  it('denies a queue identity that is not bound to the workflow run', async () => {
    await expect(
      job.handle(
        {
          workspaceId: WORKSPACE_ID,
          workflowRunId: WORKFLOW_RUN_ID,
          policySchemaVersion: 1,
          rootCorrelationId: WORKFLOW_RUN_ID,
        },
        { jobId: 'job-1', jobName: 'RunWorkflowJob' },
      ),
    ).rejects.toThrow(
      'Protected workflow job identity is missing or mismatched.',
    );

    expect(
      applicationService.findTwentyStandardApplicationOrThrow,
    ).not.toHaveBeenCalled();
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
        { jobId: QUEUE_JOB_ID, jobName: 'RunWorkflowJob' },
      ),
    ).rejects.toThrow('Application role not found');
    expect(
      workspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
  });
});
