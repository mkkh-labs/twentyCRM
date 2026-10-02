import { WorkflowHandleStaledRunsWorkspaceService } from 'src/modules/workflow/workflow-runner/workflow-run-queue/workspace-services/workflow-handle-staled-runs.workspace-service';
import { WorkflowRunEnqueueWorkspaceService } from 'src/modules/workflow/workflow-runner/workflow-run-queue/workspace-services/workflow-run-enqueue.workspace-service';
import { WorkflowThrottlingWorkspaceService } from 'src/modules/workflow/workflow-runner/workflow-run-queue/workspace-services/workflow-throttling.workspace-service';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';

describe('workflow maintenance authority', () => {
  it('denies database throttling counts when service authority is unresolved', async () => {
    const workspaceOrmManager = {
      executeInWorkspaceContext: jest.fn().mockResolvedValue(0),
    };
    const workflowServiceAuthorityService = {
      resolve: jest.fn().mockRejectedValue(new Error('role not found')),
    };
    const service = Reflect.construct(WorkflowThrottlingWorkspaceService, [
      {},
      workspaceOrmManager,
      {},
      {},
      workflowServiceAuthorityService,
    ]) as WorkflowThrottlingWorkspaceService;

    await expect(
      service.getNotStartedRunsCountFromDatabase(WORKSPACE_ID),
    ).rejects.toThrow('role not found');
    expect(
      workspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
  });

  it('denies stale-run mutation when service authority is unresolved', async () => {
    const workspaceOrmManager = {
      executeInWorkspaceContext: jest.fn().mockResolvedValue(undefined),
    };
    const workflowServiceAuthorityService = {
      resolve: jest.fn().mockRejectedValue(new Error('role not found')),
    };
    const service = Reflect.construct(
      WorkflowHandleStaledRunsWorkspaceService,
      [
        workspaceOrmManager,
        {},
        {},
        {},
        {},
        {},
        workflowServiceAuthorityService,
      ],
    ) as WorkflowHandleStaledRunsWorkspaceService;

    await expect(
      service.handleStaledRunsForWorkspace(WORKSPACE_ID),
    ).rejects.toThrow('role not found');
    expect(
      workspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
  });

  it('does not access runs or queue work when enqueue authority is unresolved', async () => {
    const workspaceOrmManager = {
      executeInWorkspaceContext: jest.fn().mockResolvedValue(undefined),
    };
    const workflowThrottlingWorkspaceService = {
      acquireWorkflowEnqueueLock: jest.fn().mockResolvedValue(true),
      releaseWorkflowEnqueueLock: jest.fn(),
    };
    const workflowServiceAuthorityService = {
      resolve: jest.fn().mockRejectedValue(new Error('role not found')),
    };
    const service = Reflect.construct(WorkflowRunEnqueueWorkspaceService, [
      workflowThrottlingWorkspaceService,
      workspaceOrmManager,
      { add: jest.fn() },
      { incrementCounterForEvent: jest.fn() },
      workflowServiceAuthorityService,
    ]) as WorkflowRunEnqueueWorkspaceService;

    await service.enqueueRunsForWorkspace({
      workspaceId: WORKSPACE_ID,
      isCacheMode: false,
    });

    expect(workflowServiceAuthorityService.resolve).toHaveBeenCalledWith(
      WORKSPACE_ID,
    );
    expect(
      workspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
    expect(
      workflowThrottlingWorkspaceService.releaseWorkflowEnqueueLock,
    ).toHaveBeenCalledWith(WORKSPACE_ID);
  });
});
