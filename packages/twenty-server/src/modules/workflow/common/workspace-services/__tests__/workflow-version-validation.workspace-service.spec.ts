import { withWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { WorkflowVersionStatus } from 'src/modules/workflow/common/standard-objects/workflow-version.workspace-entity';
import { WorkflowVersionValidationWorkspaceService } from 'src/modules/workflow/common/workspace-services/workflow-version-validation.workspace-service';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const WORKFLOW_ID = '22222222-2222-4222-8222-222222222222';
const WORKFLOW_VERSION_ID = '33333333-3333-4333-8333-333333333333';

describe('WorkflowVersionValidationWorkspaceService', () => {
  it('denies create validation when authority resolves to bypass', async () => {
    const workspaceOrmManager = {
      resolveRolePermissionConfigForAuthContext: jest
        .fn()
        .mockResolvedValue({ shouldBypassPermissionChecks: true }),
      executeInWorkspaceContext: jest.fn().mockResolvedValue(undefined),
    };
    const service = new WorkflowVersionValidationWorkspaceService(
      {} as never,
      workspaceOrmManager as never,
    );

    await expect(
      withWorkspaceAuthContext(
        {
          type: 'system',
          workspace: { id: WORKSPACE_ID } as never,
        },
        () =>
          service.validateWorkflowVersionForCreateOne(WORKSPACE_ID, {
            data: { workflowId: WORKFLOW_ID },
          } as never),
      ),
    ).rejects.toThrow('Workflow authority is unresolved');
    expect(
      workspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
  });

  it('denies delete validation when authority resolves to bypass', async () => {
    const workflowCommonWorkspaceService = {
      getWorkflowVersionOrFail: jest.fn().mockResolvedValue({
        id: WORKFLOW_VERSION_ID,
        workflowId: WORKFLOW_ID,
        status: WorkflowVersionStatus.DRAFT,
      }),
    };
    const workspaceOrmManager = {
      resolveRolePermissionConfigForAuthContext: jest
        .fn()
        .mockResolvedValue({ shouldBypassPermissionChecks: true }),
      executeInWorkspaceContext: jest.fn().mockResolvedValue(undefined),
    };
    const service = new WorkflowVersionValidationWorkspaceService(
      workflowCommonWorkspaceService as never,
      workspaceOrmManager as never,
    );

    await expect(
      withWorkspaceAuthContext(
        {
          type: 'system',
          workspace: { id: WORKSPACE_ID } as never,
        },
        () =>
          service.validateWorkflowVersionForDeleteOne(WORKSPACE_ID, {
            id: WORKFLOW_VERSION_ID,
          } as never),
      ),
    ).rejects.toThrow('Workflow authority is unresolved');
    expect(
      workspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
  });

  it('uses caller-scoped authority while checking for an existing draft', async () => {
    const rolePermissionConfig = { unionOf: ['role-id'] };
    const authContext = {
      type: 'application' as const,
      workspace: { id: WORKSPACE_ID } as never,
      application: {} as never,
    };
    const workflowVersionRepository = {
      exists: jest.fn().mockResolvedValue(false),
    };
    const workspaceOrmManager = {
      resolveRolePermissionConfigForAuthContext: jest
        .fn()
        .mockResolvedValue(rolePermissionConfig),
      executeInWorkspaceContext: jest.fn((fn: () => unknown) => fn()),
      getRepository: jest.fn().mockReturnValue(workflowVersionRepository),
    };
    const service = new WorkflowVersionValidationWorkspaceService(
      {} as never,
      workspaceOrmManager as never,
    );

    await withWorkspaceAuthContext(authContext, () =>
      service.validateWorkflowVersionForCreateOne(WORKSPACE_ID, {
        data: { workflowId: WORKFLOW_ID },
      } as never),
    );

    expect(workspaceOrmManager.getRepository).toHaveBeenCalledWith(
      'workflowVersion',
      rolePermissionConfig,
    );
  });
});
