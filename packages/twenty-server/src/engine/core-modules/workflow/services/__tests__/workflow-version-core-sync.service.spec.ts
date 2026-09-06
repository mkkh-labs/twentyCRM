import { withWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { WorkflowVersionCoreSyncService } from 'src/engine/core-modules/workflow/services/workflow-version-core-sync.service';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const WORKFLOW_VERSION_ID = '22222222-2222-4222-8222-222222222222';

describe('WorkflowVersionCoreSyncService', () => {
  it.each([
    {
      operation: 'delete mapping',
      invoke: (service: WorkflowVersionCoreSyncService) =>
        service.deleteCoreVersionsByWorkspaceVersionIds(WORKSPACE_ID, [
          WORKFLOW_VERSION_ID,
        ]),
    },
    {
      operation: 'restore mapping',
      invoke: (service: WorkflowVersionCoreSyncService) =>
        service.recreateCoreVersionsByWorkflowId(
          WORKSPACE_ID,
          '33333333-3333-4333-8333-333333333333',
        ),
    },
  ])(
    'denies $operation when source-record authority resolves to bypass',
    async ({ invoke }) => {
      const workspaceOrmManager = {
        resolveRolePermissionConfigForAuthContext: jest
          .fn()
          .mockResolvedValue({ shouldBypassPermissionChecks: true }),
        executeInWorkspaceContext: jest.fn().mockResolvedValue([]),
      };
      const service = new WorkflowVersionCoreSyncService(
        { delete: jest.fn() } as never,
        {} as never,
        workspaceOrmManager as never,
        { invalidateAndRecompute: jest.fn() } as never,
      );

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

  it('denies mirrored workflow writes when implicit authority resolves to bypass', async () => {
    const workspaceOrmManager = {
      resolveRolePermissionConfigForAuthContext: jest
        .fn()
        .mockResolvedValue({ shouldBypassPermissionChecks: true }),
      executeInWorkspaceContext: jest.fn().mockResolvedValue(undefined),
    };
    const service = new WorkflowVersionCoreSyncService(
      {} as never,
      {} as never,
      workspaceOrmManager as never,
      { invalidateAndRecompute: jest.fn() } as never,
    );
    const write = jest.fn().mockResolvedValue(WORKFLOW_VERSION_ID);

    await expect(
      withWorkspaceAuthContext(
        {
          type: 'system',
          workspace: { id: WORKSPACE_ID } as never,
        },
        () => service.writeWorkflowVersionAndMirror(WORKSPACE_ID, write),
      ),
    ).rejects.toThrow('Workflow authority is unresolved');
    expect(write).not.toHaveBeenCalled();
  });

  it('uses implicit caller-scoped authority for the transactional write', async () => {
    const rolePermissionConfig = { unionOf: ['role-id'] };
    const authContext = {
      type: 'application' as const,
      workspace: { id: WORKSPACE_ID } as never,
      application: {} as never,
    };
    const workflowVersionRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    const transactionScope = {
      getRepository: jest.fn().mockReturnValue(workflowVersionRepository),
    };
    const workspaceOrmManager = {
      resolveRolePermissionConfigForAuthContext: jest
        .fn()
        .mockResolvedValue(rolePermissionConfig),
      executeInWorkspaceContext: jest.fn((fn: () => unknown) => fn()),
      runInWorkspaceTransaction: jest.fn(
        (fn: (scope: typeof transactionScope) => unknown) =>
          fn(transactionScope),
      ),
    };
    const service = new WorkflowVersionCoreSyncService(
      {} as never,
      {} as never,
      workspaceOrmManager as never,
      { invalidateAndRecompute: jest.fn() } as never,
    );
    const write = jest.fn().mockResolvedValue(WORKFLOW_VERSION_ID);

    await withWorkspaceAuthContext(authContext, () =>
      service.writeWorkflowVersionAndMirror(WORKSPACE_ID, write),
    );

    expect(transactionScope.getRepository).toHaveBeenCalledWith(
      'workflowVersion',
      rolePermissionConfig,
    );
    expect(write).toHaveBeenCalledWith(
      workflowVersionRepository,
      transactionScope,
    );
  });

  it('writes the internal core-version link with a bounded transactional query', async () => {
    const rolePermissionConfig = { unionOf: ['role-id'] };
    const authContext = {
      type: 'application' as const,
      workspace: { id: WORKSPACE_ID } as never,
      application: {} as never,
    };
    const persistedWorkflowVersion = {
      id: WORKFLOW_VERSION_ID,
      workflowId: '33333333-3333-4333-8333-333333333333',
      coreWorkflowVersionId: null,
      trigger: null,
      steps: [],
      status: 'DRAFT',
    };
    const workflowVersionRepository = {
      findOne: jest.fn().mockResolvedValue(persistedWorkflowVersion),
      update: jest.fn(),
    };
    const transactionScope = {
      getRepository: jest.fn().mockReturnValue(workflowVersionRepository),
      executeRawQuery: jest.fn().mockResolvedValue([]),
    };
    const workspaceOrmManager = {
      executeInWorkspaceContext: jest.fn((fn: () => unknown) => fn()),
      runInWorkspaceTransaction: jest.fn(
        (fn: (scope: typeof transactionScope) => unknown) =>
          fn(transactionScope),
      ),
    };
    const service = new WorkflowVersionCoreSyncService(
      {} as never,
      {
        findOne: jest.fn().mockResolvedValue({
          id: WORKSPACE_ID,
          workspaceCustomApplicationId: 'application-id',
        }),
      } as never,
      workspaceOrmManager as never,
      {
        getOrRecompute: jest.fn().mockResolvedValue({
          flatFieldMetadataMaps: {
            byUniversalIdentifier: new Proxy({}, { get: () => ({}) }),
          },
        }),
        invalidateAndRecompute: jest.fn(),
      } as never,
    );

    const result = await service.writeWorkflowVersionAndMirror(
      WORKSPACE_ID,
      async () => WORKFLOW_VERSION_ID,
      { authContext, rolePermissionConfig },
    );

    expect(result).toEqual(persistedWorkflowVersion);

    expect(transactionScope.executeRawQuery.mock.calls).toEqual(
      expect.arrayContaining([
        [
          expect.stringMatching(/UPDATE .*\."workflowVersion"/),
          expect.any(Array),
        ],
      ]),
    );
  });
});
