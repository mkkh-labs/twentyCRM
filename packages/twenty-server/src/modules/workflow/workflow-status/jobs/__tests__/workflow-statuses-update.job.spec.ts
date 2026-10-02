import {
  WorkflowStatusesUpdateJob,
  WorkflowVersionEventType,
} from 'src/modules/workflow/workflow-status/jobs/workflow-statuses-update.job';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const WORKFLOW_ID = '22222222-2222-4222-8222-222222222222';

describe('WorkflowStatusesUpdateJob', () => {
  it('fails closed before repository access when service authority is unresolved', async () => {
    const workspaceOrmManager = {
      executeInWorkspaceContext: jest.fn().mockResolvedValue(undefined),
    };
    const workflowServiceAuthorityService = {
      resolve: jest.fn().mockRejectedValue(new Error('role not found')),
    };
    const job = Reflect.construct(WorkflowStatusesUpdateJob, [
      workspaceOrmManager,
      workflowServiceAuthorityService,
    ]) as WorkflowStatusesUpdateJob;

    await expect(
      job.handle({
        type: WorkflowVersionEventType.CREATE,
        workspaceId: WORKSPACE_ID,
        workflowIds: [WORKFLOW_ID],
      }),
    ).rejects.toThrow('role not found');
    expect(
      workspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
  });

  it('uses reconstructed application authority for status reads and writes', async () => {
    const rolePermissionConfig = { unionOf: ['role-id'] };
    const authContext = {
      type: 'application' as const,
      workspace: { id: WORKSPACE_ID },
      application: {},
    };
    const workflowRepository = {
      findOneOrFail: jest.fn().mockResolvedValue({ statuses: [] }),
      update: jest.fn(),
    };
    const workflowVersionRepository = {
      find: jest.fn().mockResolvedValue([]),
    };
    const workspaceOrmManager = {
      executeInWorkspaceContext: jest.fn((fn: () => unknown) => fn()),
      getRepository: jest.fn((objectName: string) =>
        objectName === 'workflow'
          ? workflowRepository
          : workflowVersionRepository,
      ),
    };
    const workflowServiceAuthorityService = {
      resolve: jest
        .fn()
        .mockResolvedValue({ authContext, rolePermissionConfig }),
    };
    const job = Reflect.construct(WorkflowStatusesUpdateJob, [
      workspaceOrmManager,
      workflowServiceAuthorityService,
    ]) as WorkflowStatusesUpdateJob;

    await job.handle({
      type: WorkflowVersionEventType.CREATE,
      workspaceId: WORKSPACE_ID,
      workflowIds: [WORKFLOW_ID],
    });

    expect(workflowServiceAuthorityService.resolve).toHaveBeenCalledWith(
      WORKSPACE_ID,
    );
    expect(workspaceOrmManager.getRepository).toHaveBeenCalledWith(
      'workflow',
      rolePermissionConfig,
    );
    expect(workspaceOrmManager.getRepository).toHaveBeenCalledWith(
      'workflowVersion',
      rolePermissionConfig,
    );
  });
});
