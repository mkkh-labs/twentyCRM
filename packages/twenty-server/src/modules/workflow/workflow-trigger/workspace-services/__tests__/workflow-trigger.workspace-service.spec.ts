import { withWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { WorkflowVersionStatus } from 'src/modules/workflow/common/standard-objects/workflow-version.workspace-entity';
import { WorkflowTriggerExceptionCode } from 'src/modules/workflow/workflow-trigger/exceptions/workflow-trigger.exception';
import { WorkflowTriggerType } from 'src/modules/workflow/workflow-trigger/types/workflow-trigger.type';
import { WorkflowTriggerWorkspaceService } from 'src/modules/workflow/workflow-trigger/workspace-services/workflow-trigger.workspace-service';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const FOREIGN_WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const WORKFLOW_VERSION_ID = '33333333-3333-4333-8333-333333333333';

describe('WorkflowTriggerWorkspaceService', () => {
  it.each(['activateWorkflowVersion', 'deactivateWorkflowVersion'] as const)(
    'denies %s before a protected write when authority resolves to bypass',
    async (methodName) => {
      const workspaceOrmManager = {
        resolveRolePermissionConfigForAuthContext: jest
          .fn()
          .mockResolvedValue({ shouldBypassPermissionChecks: true }),
        executeInWorkspaceContext: jest.fn().mockResolvedValue(true),
      };
      const service = new WorkflowTriggerWorkspaceService(
        workspaceOrmManager as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
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
          () => service[methodName](WORKFLOW_VERSION_ID, WORKSPACE_ID),
        ),
      ).rejects.toMatchObject({ code: WorkflowTriggerExceptionCode.FORBIDDEN });
      expect(
        workspaceOrmManager.executeInWorkspaceContext,
      ).not.toHaveBeenCalled();
    },
  );

  it.each(['activateWorkflowVersion', 'deactivateWorkflowVersion'] as const)(
    'denies %s when caller authority belongs to another workspace',
    async (methodName) => {
      const workspaceOrmManager = {
        resolveRolePermissionConfigForAuthContext: jest
          .fn()
          .mockResolvedValue({ unionOf: ['role-id'] }),
        executeInWorkspaceContext: jest.fn().mockResolvedValue(true),
      };
      const service = new WorkflowTriggerWorkspaceService(
        workspaceOrmManager as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );

      await expect(
        withWorkspaceAuthContext(
          {
            type: 'application',
            workspace: { id: FOREIGN_WORKSPACE_ID } as never,
            application: {} as never,
          },
          () => service[methodName](WORKFLOW_VERSION_ID, WORKSPACE_ID),
        ),
      ).rejects.toMatchObject({ code: WorkflowTriggerExceptionCode.FORBIDDEN });
      expect(
        workspaceOrmManager.executeInWorkspaceContext,
      ).not.toHaveBeenCalled();
    },
  );

  it('uses caller-scoped authority for activation reads and writes', async () => {
    const rolePermissionConfig = { unionOf: ['role-id'] };
    const workflowVersion = {
      id: WORKFLOW_VERSION_ID,
      workflowId: '44444444-4444-4444-8444-444444444444',
      coreWorkflowVersionId: null,
      status: WorkflowVersionStatus.DRAFT,
      trigger: {
        name: 'Webhook',
        type: WorkflowTriggerType.WEBHOOK,
        settings: {
          outputSchema: {},
          httpMethod: 'GET',
          authentication: null,
        },
      },
      steps: [{ id: 'step-id', type: 'CODE' }],
    };
    const workflow = {
      id: workflowVersion.workflowId,
      lastPublishedVersionId: null,
    };
    const workflowVersionRepository = {
      findOne: jest.fn().mockResolvedValue(workflowVersion),
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const workflowRepository = {
      findOne: jest.fn().mockResolvedValue(workflow),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const getRepository = jest.fn((objectName: string) =>
      objectName === 'workflow'
        ? workflowRepository
        : workflowVersionRepository,
    );
    const transactionScope = {
      getRepository: jest.fn((objectName: string) =>
        objectName === 'workflow'
          ? workflowRepository
          : workflowVersionRepository,
      ),
    };
    const workspaceOrmManager = {
      resolveRolePermissionConfigForAuthContext: jest
        .fn()
        .mockResolvedValue(rolePermissionConfig),
      executeInWorkspaceContext: jest.fn((fn: () => unknown) => fn()),
      getRepository,
      runInWorkspaceTransaction: jest.fn(
        (fn: (scope: typeof transactionScope) => unknown) =>
          fn(transactionScope),
      ),
    };
    const workflowCommonWorkspaceService = {
      getValidWorkflowVersionOrFail: jest
        .fn()
        .mockResolvedValue(workflowVersion),
    };
    const codeStepBuildService = {
      buildCodeStepsFromSourceForSteps: jest.fn(),
      switchCodeStepLogicFunctionsToPrebuilt: jest.fn(),
    };
    const workflowVersionCoreSyncService = {
      mirrorWorkflowVersionWrite: jest.fn(),
      invalidateAutomatedTriggerMaps: jest.fn(),
    };
    const service = new WorkflowTriggerWorkspaceService(
      workspaceOrmManager as never,
      workflowCommonWorkspaceService as never,
      codeStepBuildService as never,
      {} as never,
      {} as never,
      { emitCustomBatchEvent: jest.fn() } as never,
      {} as never,
      workflowVersionCoreSyncService as never,
      {} as never,
    );

    await expect(
      withWorkspaceAuthContext(
        {
          type: 'application',
          workspace: { id: WORKSPACE_ID } as never,
          application: {} as never,
        },
        () =>
          service.activateWorkflowVersion(WORKFLOW_VERSION_ID, WORKSPACE_ID),
      ),
    ).resolves.toBe(true);

    expect(getRepository).toHaveBeenCalledWith(
      'workflowVersion',
      rolePermissionConfig,
    );
    expect(getRepository).toHaveBeenCalledWith(
      'workflow',
      rolePermissionConfig,
    );
    expect(transactionScope.getRepository).toHaveBeenCalledWith(
      'workflowVersion',
      rolePermissionConfig,
    );
    expect(transactionScope.getRepository).toHaveBeenCalledWith(
      'workflow',
      rolePermissionConfig,
    );
  });

  it('uses explicitly reconstructed authority when running a workflow', async () => {
    const rolePermissionConfig = { unionOf: ['role-id'] };
    const authContext = {
      type: 'application' as const,
      workspace: { id: WORKSPACE_ID } as never,
      application: {} as never,
    };
    const workspaceOrmManager = {
      resolveRolePermissionConfigForAuthContext: jest
        .fn()
        .mockResolvedValue({ shouldBypassPermissionChecks: true }),
    };
    const workflowCommonWorkspaceService = {
      getWorkflowVersionOrFail: jest.fn().mockResolvedValue({}),
    };
    const workflowRunnerWorkspaceService = {
      run: jest.fn().mockResolvedValue({ workflowRunId: 'run-id' }),
    };
    const service = new WorkflowTriggerWorkspaceService(
      workspaceOrmManager as never,
      workflowCommonWorkspaceService as never,
      {} as never,
      workflowRunnerWorkspaceService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const runWithExplicitAuthority = service.runWorkflowVersion.bind(
      service,
    ) as unknown as (input: object) => Promise<{ workflowRunId: string }>;

    await expect(
      withWorkspaceAuthContext(
        {
          type: 'system',
          workspace: { id: WORKSPACE_ID } as never,
        },
        () =>
          runWithExplicitAuthority({
            workflowVersionId: WORKFLOW_VERSION_ID,
            payload: {},
            createdBy: { source: 'MANUAL' },
            workspaceId: WORKSPACE_ID,
            authContext,
            rolePermissionConfig,
          }),
      ),
    ).resolves.toEqual({ workflowRunId: 'run-id' });
    expect(
      workflowCommonWorkspaceService.getWorkflowVersionOrFail,
    ).toHaveBeenCalledWith({
      workflowVersionId: WORKFLOW_VERSION_ID,
      workspaceId: WORKSPACE_ID,
      authContext,
      rolePermissionConfig,
    });
  });
});
