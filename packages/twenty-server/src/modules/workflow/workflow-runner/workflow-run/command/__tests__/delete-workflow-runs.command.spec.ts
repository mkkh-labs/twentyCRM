import { DeleteWorkflowRunsCommand } from 'src/modules/workflow/workflow-runner/workflow-run/command/delete-workflow-runs.command';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';

describe('DeleteWorkflowRunsCommand', () => {
  it('denies cleanup before repository access when service authority is unresolved', async () => {
    const workspaceOrmManager = {
      executeInWorkspaceContext: jest.fn().mockResolvedValue(undefined),
    };
    const workflowServiceAuthorityService = {
      resolve: jest.fn().mockRejectedValue(new Error('role not found')),
    };
    const command = Reflect.construct(DeleteWorkflowRunsCommand, [
      workspaceOrmManager,
      {},
      workflowServiceAuthorityService,
    ]) as DeleteWorkflowRunsCommand;

    await expect(
      command.runOnWorkspace({
        workspaceId: WORKSPACE_ID,
        options: { dryRun: true },
      } as never),
    ).rejects.toThrow('role not found');
    expect(
      workspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
  });
});
