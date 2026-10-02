import { withWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { WorkflowVersionStatus } from 'src/modules/workflow/common/standard-objects/workflow-version.workspace-entity';
import { WorkflowVersionWorkspaceService } from 'src/modules/workflow/workflow-builder/workflow-version/workflow-version.workspace-service';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const WORKFLOW_ID = '22222222-2222-4222-8222-222222222222';
const WORKFLOW_VERSION_ID = '33333333-3333-4333-8333-333333333333';

const createService = (workspaceOrmManager: object, overrides?: object[]) => {
  const service = new WorkflowVersionWorkspaceService(
    workspaceOrmManager as never,
    (overrides?.[0] ?? {}) as never,
    (overrides?.[1] ?? {}) as never,
    (overrides?.[2] ?? {}) as never,
    (overrides?.[3] ?? {}) as never,
    (overrides?.[4] ?? {}) as never,
  );

  Object.defineProperty(service, 'cacheLockService', {
    value: { withLock: (work: () => unknown) => work() },
  });

  return service;
};

describe('WorkflowVersionWorkspaceService', () => {
  it.each([
    {
      operation: 'create draft',
      invoke: (service: WorkflowVersionWorkspaceService) =>
        service.createDraftFromWorkflowVersion({
          workspaceId: WORKSPACE_ID,
          workflowId: WORKFLOW_ID,
          workflowVersionIdToCopy: WORKFLOW_VERSION_ID,
        }),
    },
    {
      operation: 'duplicate workflow',
      invoke: (service: WorkflowVersionWorkspaceService) =>
        service.duplicateWorkflow({
          workspaceId: WORKSPACE_ID,
          workflowIdToDuplicate: WORKFLOW_ID,
          workflowVersionIdToCopy: WORKFLOW_VERSION_ID,
        }),
    },
    {
      operation: 'update positions',
      invoke: (service: WorkflowVersionWorkspaceService) =>
        service.updateWorkflowVersionPositions({
          workspaceId: WORKSPACE_ID,
          workflowVersionId: WORKFLOW_VERSION_ID,
          positions: [],
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

  it('uses caller-scoped authority for position reads and mirrored writes', async () => {
    const rolePermissionConfig = { unionOf: ['role-id'] };
    const authContext = {
      type: 'application' as const,
      workspace: { id: WORKSPACE_ID } as never,
      application: {} as never,
    };
    const workflowVersionRepository = {
      findOneOrFail: jest.fn().mockResolvedValue({
        id: WORKFLOW_VERSION_ID,
        status: WorkflowVersionStatus.DRAFT,
        trigger: null,
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
    const service = createService(workspaceOrmManager, [
      {},
      {},
      {},
      {},
      workflowVersionCoreSyncService,
    ]);

    await withWorkspaceAuthContext(authContext, () =>
      service.updateWorkflowVersionPositions({
        workspaceId: WORKSPACE_ID,
        workflowVersionId: WORKFLOW_VERSION_ID,
        positions: [],
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

  it('returns the complete persisted version after a scoped duplicate insert', async () => {
    const rolePermissionConfig = { unionOf: ['role-id'] };
    const authContext = {
      type: 'application' as const,
      workspace: { id: WORKSPACE_ID } as never,
      application: {} as never,
    };
    const duplicatedWorkflowId = '44444444-4444-4444-8444-444444444444';
    const duplicatedVersionId = '55555555-5555-4555-8555-555555555555';
    const sourceStep = {
      id: 'source-step',
      type: 'FIND_RECORDS',
      name: 'Find records',
      valid: true,
      nextStepIds: [],
      position: { x: 0, y: 0 },
      settings: {},
    };
    const duplicatedStep = { ...sourceStep, id: 'duplicated-step' };
    const sourceVersion = {
      id: WORKFLOW_VERSION_ID,
      workflowId: WORKFLOW_ID,
      trigger: {
        name: 'Manual Trigger',
        type: 'MANUAL',
        settings: { outputSchema: {} },
        nextStepIds: ['source-step'],
        position: { x: 0, y: 0 },
      },
      steps: [sourceStep],
    };
    const persistedVersion = {
      id: duplicatedVersionId,
      workflowId: duplicatedWorkflowId,
      name: 'v1',
      status: WorkflowVersionStatus.DRAFT,
      trigger: { ...sourceVersion.trigger, nextStepIds: ['duplicated-step'] },
      steps: [duplicatedStep],
      createdAt: '2026-09-04T00:00:00.000Z',
      updatedAt: '2026-09-04T00:00:00.000Z',
    };
    const workflowRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: WORKFLOW_ID,
        name: 'Source workflow',
      }),
      insert: jest.fn().mockResolvedValue({
        generatedMaps: [{ id: duplicatedWorkflowId }],
      }),
    };
    const workflowVersionRepository = {
      findOne: jest.fn().mockResolvedValue(sourceVersion),
      insert: jest.fn().mockResolvedValue({
        identifiers: [{ id: duplicatedVersionId }],
        generatedMaps: [{ id: duplicatedVersionId }],
        raw: [{ id: duplicatedVersionId }],
      }),
    };
    const workspaceOrmManager = {
      resolveRolePermissionConfigForAuthContext: jest
        .fn()
        .mockResolvedValue(rolePermissionConfig),
      executeInWorkspaceContext: jest.fn((fn: () => unknown) => fn()),
      getRepository: jest.fn((objectName: string) =>
        objectName === 'workflow'
          ? workflowRepository
          : workflowVersionRepository,
      ),
    };
    const workflowVersionCoreSyncService = {
      writeWorkflowVersionAndMirror: jest.fn(
        async (
          _workspaceId: string,
          write: (repository: object) => unknown,
        ) => {
          await write(workflowVersionRepository);

          return persistedVersion;
        },
      ),
    };
    const service = createService(workspaceOrmManager, [
      {},
      { cloneStep: jest.fn().mockResolvedValue(duplicatedStep) },
      { buildRecordPosition: jest.fn().mockResolvedValue('first') },
      {},
      workflowVersionCoreSyncService,
    ]);

    const result = await withWorkspaceAuthContext(authContext, () =>
      service.duplicateWorkflow({
        workspaceId: WORKSPACE_ID,
        workflowIdToDuplicate: WORKFLOW_ID,
        workflowVersionIdToCopy: WORKFLOW_VERSION_ID,
      }),
    );

    expect(result).toEqual(persistedVersion);
  });

  it('returns the complete persisted version after a scoped draft insert', async () => {
    const rolePermissionConfig = { unionOf: ['role-id'] };
    const authContext = {
      type: 'application' as const,
      workspace: { id: WORKSPACE_ID } as never,
      application: {} as never,
    };
    const draftVersionId = '66666666-6666-4666-8666-666666666666';
    const sourceStep = {
      id: 'source-step',
      type: 'FIND_RECORDS',
      name: 'Find records',
      valid: true,
      nextStepIds: [],
      position: { x: 0, y: 0 },
      settings: {},
    };
    const duplicatedStep = { ...sourceStep, id: 'duplicated-step' };
    const sourceVersion = {
      id: WORKFLOW_VERSION_ID,
      workflowId: WORKFLOW_ID,
      trigger: {
        name: 'Manual Trigger',
        type: 'MANUAL',
        settings: { outputSchema: {} },
        nextStepIds: ['source-step'],
        position: { x: 0, y: 0 },
      },
      steps: [sourceStep],
    };
    const persistedVersion = {
      id: draftVersionId,
      workflowId: WORKFLOW_ID,
      name: 'v2',
      status: WorkflowVersionStatus.DRAFT,
      trigger: sourceVersion.trigger,
      steps: [duplicatedStep],
      createdAt: '2026-09-04T00:00:00.000Z',
      updatedAt: '2026-09-04T00:00:00.000Z',
    };
    const workflowVersionRepository = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(sourceVersion)
        .mockResolvedValueOnce(undefined),
      count: jest.fn().mockResolvedValue(1),
      insert: jest.fn().mockResolvedValue({
        identifiers: [{ id: draftVersionId }],
        generatedMaps: [{ id: draftVersionId }],
        raw: [{ id: draftVersionId }],
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
      writeWorkflowVersionAndMirror: jest.fn(
        async (
          _workspaceId: string,
          write: (repository: object) => unknown,
        ) => {
          await write(workflowVersionRepository);

          return persistedVersion;
        },
      ),
    };
    const service = createService(workspaceOrmManager, [
      { createDraftStep: jest.fn().mockResolvedValue(duplicatedStep) },
      {},
      { buildRecordPosition: jest.fn().mockResolvedValue('first') },
      {},
      workflowVersionCoreSyncService,
    ]);

    const result = await withWorkspaceAuthContext(authContext, () =>
      service.createDraftFromWorkflowVersion({
        workspaceId: WORKSPACE_ID,
        workflowId: WORKFLOW_ID,
        workflowVersionIdToCopy: WORKFLOW_VERSION_ID,
      }),
    );

    expect(result).toEqual(persistedVersion);
  });
});
