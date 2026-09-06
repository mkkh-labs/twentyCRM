import { withWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { WorkflowVersionStepOperationsWorkspaceService } from 'src/modules/workflow/workflow-builder/workflow-version-step/workflow-version-step-operations.workspace-service';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const WORKFLOW_VERSION_ID = '22222222-2222-4222-8222-222222222222';

const createService = (
  workspaceOrmManager: object,
  workflowVersionCoreSyncService: object = {},
) =>
  new WorkflowVersionStepOperationsWorkspaceService(
    workspaceOrmManager as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    workflowVersionCoreSyncService as never,
  );

describe('WorkflowVersionStepOperationsWorkspaceService', () => {
  it.each([
    {
      operation: 'form response enrichment',
      invoke: (service: WorkflowVersionStepOperationsWorkspaceService) =>
        service.enrichFormStepResponse({
          workspaceId: WORKSPACE_ID,
          step: { settings: { input: [] } } as never,
          response: {},
        }),
    },
    {
      operation: 'iterator placeholder creation',
      invoke: (service: WorkflowVersionStepOperationsWorkspaceService) =>
        service.createEmptyNodeForIteratorStep({
          iteratorStepId: 'iterator-step',
          workflowVersionId: WORKFLOW_VERSION_ID,
          workspaceId: WORKSPACE_ID,
        }),
    },
    {
      operation: 'branch placeholder creation',
      invoke: (service: WorkflowVersionStepOperationsWorkspaceService) =>
        service.createEmptyNodesForIfElseStep({
          workflowVersionId: WORKFLOW_VERSION_ID,
          workspaceId: WORKSPACE_ID,
        }),
    },
  ])(
    'denies $operation when authority resolves to bypass',
    async ({ invoke }) => {
      const workspaceOrmManager = {
        resolveRolePermissionConfigForAuthContext: jest
          .fn()
          .mockResolvedValue({ shouldBypassPermissionChecks: true }),
        executeInWorkspaceContext: jest.fn().mockResolvedValue(undefined),
      };
      const service = createService(workspaceOrmManager);

      await expect(
        withWorkspaceAuthContext(
          {
            type: 'system',
            workspace: { id: WORKSPACE_ID } as never,
          },
          async () => {
            await invoke(service);
          },
        ),
      ).rejects.toThrow('Workflow authority is unresolved');
      expect(
        workspaceOrmManager.executeInWorkspaceContext,
      ).not.toHaveBeenCalled();
    },
  );

  it('uses caller-scoped authority for iterator placeholder reads and writes', async () => {
    const rolePermissionConfig = { unionOf: ['role-id'] };
    const authContext = {
      type: 'application' as const,
      workspace: { id: WORKSPACE_ID } as never,
      application: {} as never,
    };
    const workflowVersionRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: WORKFLOW_VERSION_ID,
        steps: [],
      }),
    };
    const workspaceOrmManager = {
      resolveRolePermissionConfigForAuthContext: jest
        .fn()
        .mockResolvedValue(rolePermissionConfig),
      executeInWorkspaceContext: jest.fn((fn: () => unknown) => fn()),
      getRepository: jest.fn().mockReturnValue(workflowVersionRepository),
    };
    const workflowVersionCoreSyncService = {
      writeWorkflowVersionAndMirror: jest.fn(),
    };
    const service = createService(
      workspaceOrmManager,
      workflowVersionCoreSyncService,
    );

    await withWorkspaceAuthContext(authContext, () =>
      service.createEmptyNodeForIteratorStep({
        iteratorStepId: 'iterator-step',
        workflowVersionId: WORKFLOW_VERSION_ID,
        workspaceId: WORKSPACE_ID,
      }),
    );

    expect(workspaceOrmManager.getRepository).toHaveBeenCalledWith(
      'workflowVersion',
      rolePermissionConfig,
    );
    expect(
      workflowVersionCoreSyncService.writeWorkflowVersionAndMirror,
    ).toHaveBeenCalledWith(WORKSPACE_ID, expect.any(Function), {
      authContext,
      rolePermissionConfig,
    });
  });
});
