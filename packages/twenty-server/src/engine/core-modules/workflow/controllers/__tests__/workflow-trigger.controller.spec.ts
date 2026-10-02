import { WorkflowVersionStatus } from 'src/modules/workflow/common/standard-objects/workflow-version.workspace-entity';
import { WorkflowTriggerType } from 'src/modules/workflow/workflow-trigger/types/workflow-trigger.type';
import { WorkflowTriggerController } from 'src/engine/core-modules/workflow/controllers/workflow-trigger.controller';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const WORKFLOW_ID = '22222222-2222-4222-8222-222222222222';
const WORKFLOW_VERSION_ID = '33333333-3333-4333-8333-333333333333';

describe('WorkflowTriggerController', () => {
  it('uses reconstructed application authority for public webhook reads and execution', async () => {
    const rolePermissionConfig = { unionOf: ['role-id'] };
    const authContext = {
      type: 'application' as const,
      workspace: { id: WORKSPACE_ID },
      application: {},
    };
    const workflowRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: WORKFLOW_ID,
        name: 'Webhook workflow',
        lastPublishedVersionId: WORKFLOW_VERSION_ID,
      }),
    };
    const workflowVersionRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: WORKFLOW_VERSION_ID,
        status: WorkflowVersionStatus.ACTIVE,
        trigger: { type: WorkflowTriggerType.WEBHOOK },
      }),
    };
    const workspaceOrmManager = {
      executeInWorkspaceContext: jest.fn((fn: () => unknown) => fn()),
      getRepository: jest.fn((objectName: string) =>
        objectName === 'workflow'
          ? workflowRepository
          : workflowVersionRepository,
      ),
    };
    const workflowTriggerWorkspaceService = {
      runWorkflowVersion: jest
        .fn()
        .mockResolvedValue({ workflowRunId: 'run-id' }),
    };
    const workflowServiceAuthorityService = {
      resolve: jest
        .fn()
        .mockResolvedValue({ authContext, rolePermissionConfig }),
    };
    const controller = Reflect.construct(WorkflowTriggerController, [
      workspaceOrmManager,
      workflowTriggerWorkspaceService,
      { existsBy: jest.fn().mockResolvedValue(true) },
      workflowServiceAuthorityService,
    ]) as WorkflowTriggerController;

    await expect(
      controller.runWorkflowByGetRequest(WORKSPACE_ID, WORKFLOW_ID),
    ).resolves.toEqual({
      workflowName: 'Webhook workflow',
      success: true,
      workflowRunId: 'run-id',
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
    expect(
      workflowTriggerWorkspaceService.runWorkflowVersion,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ authContext, rolePermissionConfig }),
    );
  });
});
