import { WorkflowTriggerExceptionCode } from 'src/modules/workflow/workflow-trigger/exceptions/workflow-trigger.exception';
import { WorkflowCommonWorkspaceService } from 'src/modules/workflow/common/workspace-services/workflow-common.workspace-service';
import { withWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';

describe('WorkflowCommonWorkspaceService', () => {
  it('denies a protected workflow read when system authority would bypass permissions', async () => {
    const workspaceOrmManager = {
      resolveRolePermissionConfigForAuthContext: jest
        .fn()
        .mockResolvedValue({ shouldBypassPermissionChecks: true }),
      executeInWorkspaceContext: jest.fn(),
    };
    const service = new WorkflowCommonWorkspaceService(
      workspaceOrmManager as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.getWorkflowVersionOrFail({
        workspaceId: WORKSPACE_ID,
        workflowVersionId: '22222222-2222-4222-8222-222222222222',
        authContext: {
          type: 'system',
          workspace: { id: WORKSPACE_ID } as never,
        },
      }),
    ).rejects.toMatchObject({ code: WorkflowTriggerExceptionCode.FORBIDDEN });
    expect(
      workspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
  });

  it('denies a protected workflow read when authority belongs to another workspace', async () => {
    const workspaceOrmManager = {
      resolveRolePermissionConfigForAuthContext: jest.fn(),
      executeInWorkspaceContext: jest.fn(),
    };
    const service = new WorkflowCommonWorkspaceService(
      workspaceOrmManager as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.getWorkflowVersionOrFail({
        workspaceId: WORKSPACE_ID,
        workflowVersionId: '22222222-2222-4222-8222-222222222222',
        authContext: {
          type: 'application',
          workspace: {
            id: '33333333-3333-4333-8333-333333333333',
          } as never,
          application: {} as never,
        },
        rolePermissionConfig: {
          unionOf: ['44444444-4444-4444-8444-444444444444'],
        },
      }),
    ).rejects.toMatchObject({ code: WorkflowTriggerExceptionCode.FORBIDDEN });
    expect(
      workspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
  });

  it('denies command-menu synchronization when supplied authority resolves to bypass', async () => {
    const workspaceOrmManager = {
      resolveRolePermissionConfigForAuthContext: jest
        .fn()
        .mockResolvedValue({ shouldBypassPermissionChecks: true }),
      executeInWorkspaceContext: jest.fn().mockResolvedValue([]),
    };
    const service = new WorkflowCommonWorkspaceService(
      workspaceOrmManager as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.syncCommandMenuItemLabelForWorkflows(
        ['22222222-2222-4222-8222-222222222222'],
        {
          type: 'system',
          workspace: { id: WORKSPACE_ID } as never,
        },
      ),
    ).rejects.toMatchObject({ code: WorkflowTriggerExceptionCode.FORBIDDEN });
    expect(
      workspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
  });

  it('denies dependent workflow deletion when authority resolves to bypass', async () => {
    const workspaceOrmManager = {
      resolveRolePermissionConfigForAuthContext: jest
        .fn()
        .mockResolvedValue({ shouldBypassPermissionChecks: true }),
      executeInWorkspaceContext: jest.fn().mockResolvedValue(undefined),
    };
    const service = new WorkflowCommonWorkspaceService(
      workspaceOrmManager as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      withWorkspaceAuthContext(
        {
          type: 'system',
          workspace: { id: WORKSPACE_ID } as never,
        },
        () =>
          service.handleWorkflowSubEntities({
            workflowIds: ['22222222-2222-4222-8222-222222222222'],
            workspaceId: WORKSPACE_ID,
            operation: 'delete',
          }),
      ),
    ).rejects.toMatchObject({ code: WorkflowTriggerExceptionCode.FORBIDDEN });
    expect(
      workspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
  });

  it('uses supplied caller authority for command-menu workflow reads', async () => {
    const rolePermissionConfig = { unionOf: ['role-id'] };
    const authContext = {
      type: 'application' as const,
      workspace: { id: WORKSPACE_ID } as never,
      application: {} as never,
    };
    const workspaceOrmManager = {
      resolveRolePermissionConfigForAuthContext: jest
        .fn()
        .mockResolvedValue(rolePermissionConfig),
      executeInWorkspaceContext: jest.fn((fn: () => unknown) => fn()),
      getRepository: jest.fn().mockReturnValue({
        find: jest.fn().mockResolvedValue([]),
      }),
    };
    const service = new WorkflowCommonWorkspaceService(
      workspaceOrmManager as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.syncCommandMenuItemLabelForWorkflows(
      ['22222222-2222-4222-8222-222222222222'],
      authContext,
    );

    expect(workspaceOrmManager.getRepository).toHaveBeenCalledWith(
      'workflow',
      rolePermissionConfig,
    );
  });
});
