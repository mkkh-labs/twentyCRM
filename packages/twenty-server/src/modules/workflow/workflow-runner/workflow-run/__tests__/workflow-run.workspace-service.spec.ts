import { withWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { WorkflowRunStatus } from 'src/modules/workflow/common/standard-objects/workflow-run.workspace-entity';
import { WorkflowRunWorkspaceService } from 'src/modules/workflow/workflow-runner/workflow-run/workflow-run.workspace-service';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const WORKFLOW_RUN_ID = '22222222-2222-4222-8222-222222222222';

const createService = (
  workspaceOrmManager: object,
  transactionalOutboxService: object = {},
) =>
  new WorkflowRunWorkspaceService(
    workspaceOrmManager as never,
    {} as never,
    {} as never,
    {} as never,
    transactionalOutboxService as never,
  );

describe('WorkflowRunWorkspaceService', () => {
  it('denies workflow-run creation when supplied authority contains a bypass', async () => {
    const workspaceOrmManager = {
      executeInWorkspaceContext: jest.fn().mockResolvedValue(undefined),
    };
    const service = createService(workspaceOrmManager);

    await expect(
      service.createWorkflowRun({
        workflowVersionId: '33333333-3333-4333-8333-333333333333',
        createdBy: { source: 'MANUAL' } as never,
        status: WorkflowRunStatus.ENQUEUED,
        triggerPayload: {},
        workspaceId: WORKSPACE_ID,
        authContext: {
          type: 'system',
          workspace: { id: WORKSPACE_ID } as never,
        },
        rolePermissionConfig: {
          shouldBypassPermissionChecks: true,
        } as never,
      }),
    ).rejects.toThrow('Workflow authority is unresolved');
    expect(
      workspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
  });

  it.each([
    {
      operation: 'read',
      invoke: (service: WorkflowRunWorkspaceService) =>
        service.getWorkflowRun({
          workflowRunId: WORKFLOW_RUN_ID,
          workspaceId: WORKSPACE_ID,
        }),
    },
    {
      operation: 'write',
      invoke: (service: WorkflowRunWorkspaceService) =>
        service.updateWorkflowRun({
          workflowRunId: WORKFLOW_RUN_ID,
          workspaceId: WORKSPACE_ID,
          partialUpdate: { name: 'updated' },
        }),
    },
  ])(
    'denies a protected workflow-run $operation when authority resolves to bypass',
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

  it('uses caller-scoped authority when reading a workflow run', async () => {
    const rolePermissionConfig = { unionOf: ['role-id'] };
    const workflowRun = { id: WORKFLOW_RUN_ID };
    const workflowRunRepository = {
      findOne: jest.fn().mockResolvedValue(workflowRun),
    };
    const workspaceOrmManager = {
      resolveRolePermissionConfigForAuthContext: jest
        .fn()
        .mockResolvedValue(rolePermissionConfig),
      executeInWorkspaceContext: jest.fn((fn: () => unknown) => fn()),
      getRepository: jest.fn().mockReturnValue(workflowRunRepository),
    };
    const service = createService(workspaceOrmManager);

    await expect(
      withWorkspaceAuthContext(
        {
          type: 'application',
          workspace: { id: WORKSPACE_ID } as never,
          application: {} as never,
        },
        () =>
          service.getWorkflowRun({
            workflowRunId: WORKFLOW_RUN_ID,
            workspaceId: WORKSPACE_ID,
          }),
      ),
    ).resolves.toBe(workflowRun);
    expect(workspaceOrmManager.getRepository).toHaveBeenCalledWith(
      'workflowRun',
      rolePermissionConfig,
    );
  });

  it('writes a workflow run and its outbox event in the same workspace transaction', async () => {
    const rolePermissionConfig = { unionOf: ['role-id'] };
    const authContext = {
      type: 'application',
      workspace: { id: WORKSPACE_ID },
      application: {},
    };
    const workflowVersion = {
      id: '33333333-3333-4333-8333-333333333333',
      workflowId: '44444444-4444-4444-8444-444444444444',
      coreWorkflowVersionId: '55555555-5555-4555-8555-555555555555',
      trigger: undefined,
      steps: undefined,
    };
    const workflow = {
      id: workflowVersion.workflowId,
      name: 'Qualified lead',
      coreWorkflowId: '66666666-6666-4666-8666-666666666666',
    };
    const workflowRepository = {
      findOne: jest.fn().mockResolvedValue(workflow),
    };
    const transactionalWorkflowRunRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      insert: jest.fn().mockResolvedValue(undefined),
    };
    const transactionScope = {
      getRepository: jest
        .fn()
        .mockReturnValue(transactionalWorkflowRunRepository),
      executeRawQuery: jest.fn(),
    };
    const workspaceOrmManager = {
      executeInWorkspaceContext: jest.fn((fn: () => unknown) => fn()),
      getRepository: jest.fn().mockReturnValue(workflowRepository),
      runInWorkspaceTransaction: jest.fn((fn: (scope: object) => unknown) =>
        fn(transactionScope),
      ),
    };
    const workflowCommonWorkspaceService = {
      getWorkflowVersionOrFail: jest.fn().mockResolvedValue(workflowVersion),
    };
    const recordPositionService = {
      buildRecordPosition: jest.fn().mockResolvedValue('position'),
    };
    const transactionalOutboxService = {
      insertWithinWorkspaceTransaction: jest.fn().mockResolvedValue(undefined),
    };
    const service = new WorkflowRunWorkspaceService(
      workspaceOrmManager as never,
      workflowCommonWorkspaceService as never,
      recordPositionService as never,
      {} as never,
      transactionalOutboxService as never,
    );

    await expect(
      service.createWorkflowRun({
        workflowVersionId: workflowVersion.id,
        createdBy: { source: 'MANUAL' } as never,
        workflowRunId: WORKFLOW_RUN_ID,
        status: WorkflowRunStatus.ENQUEUED,
        triggerPayload: { restricted: 'not persisted to outbox' },
        workspaceId: WORKSPACE_ID,
        authContext: authContext as never,
        rolePermissionConfig: rolePermissionConfig as never,
      }),
    ).resolves.toBe(WORKFLOW_RUN_ID);

    expect(workspaceOrmManager.runInWorkspaceTransaction).toHaveBeenCalledTimes(
      1,
    );
    expect(transactionalWorkflowRunRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ id: WORKFLOW_RUN_ID }),
    );
    expect(
      transactionalOutboxService.insertWithinWorkspaceTransaction,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        transactionScope,
        event: expect.objectContaining({
          eventType: 'workflow.run.created',
          aggregateId: WORKFLOW_RUN_ID,
          rootCorrelationId: WORKFLOW_RUN_ID,
          payload: {
            workflowRunId: WORKFLOW_RUN_ID,
            workflowVersionId: workflowVersion.id,
            status: WorkflowRunStatus.ENQUEUED,
          },
        }),
      }),
    );
  });
});
