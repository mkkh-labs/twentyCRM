import { WorkflowCleanWorkflowRunsCronJob } from 'src/modules/workflow/workflow-runner/workflow-run-queue/cron/jobs/workflow-clean-workflow-runs.cron.job';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';

describe('WorkflowCleanWorkflowRunsCronJob', () => {
  it('does not inspect workflow runs when service authority is unresolved', async () => {
    const workspaceOrmManager = {
      executeInWorkspaceContext: jest.fn().mockResolvedValue(false),
    };
    const exceptionHandlerService = { captureExceptions: jest.fn() };
    const workflowServiceAuthorityService = {
      resolve: jest.fn().mockRejectedValue(new Error('role not found')),
    };
    const job = Reflect.construct(WorkflowCleanWorkflowRunsCronJob, [
      { find: jest.fn().mockResolvedValue([{ id: WORKSPACE_ID }]) },
      { add: jest.fn() },
      workspaceOrmManager,
      exceptionHandlerService,
      { get: jest.fn().mockResolvedValue(undefined), set: jest.fn() },
      workflowServiceAuthorityService,
    ]) as WorkflowCleanWorkflowRunsCronJob;

    await job.handle();

    expect(workflowServiceAuthorityService.resolve).toHaveBeenCalledWith(
      WORKSPACE_ID,
    );
    expect(
      workspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
    expect(exceptionHandlerService.captureExceptions).toHaveBeenCalledTimes(1);
  });
});
