import { FieldActorSource } from 'twenty-shared/types';

import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { UserWorkspaceService } from 'src/engine/core-modules/user-workspace/user-workspace.service';
import { UserRoleService } from 'src/engine/metadata-modules/user-role/user-role.service';
import { WorkflowExecutionContextService } from 'src/modules/workflow/workflow-executor/services/workflow-execution-context.service';
import { WorkflowRunWorkspaceService } from 'src/modules/workflow/workflow-runner/workflow-run/workflow-run.workspace-service';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const WORKFLOW_RUN_ID = '22222222-2222-4222-8222-222222222222';
const APPLICATION_ID = '33333333-3333-4333-8333-333333333333';
const ROLE_ID = '44444444-4444-4444-8444-444444444444';

describe('WorkflowExecutionContextService', () => {
  const workflowRunService = {
    getWorkflowRunOrFail: jest.fn(),
  };
  const userWorkspaceService = {
    getWorkspaceMemberOrThrow: jest.fn(),
    getUserWorkspaceForUserOrThrow: jest.fn(),
  };
  const userRoleService = {
    getRoleIdForUserWorkspace: jest.fn(),
  };
  const applicationService = {
    findTwentyStandardApplicationOrThrow: jest.fn(),
    findApplicationRoleId: jest.fn(),
  };

  const service = new WorkflowExecutionContextService(
    workflowRunService as never as WorkflowRunWorkspaceService,
    userWorkspaceService as never as UserWorkspaceService,
    userRoleService as never as UserRoleService,
    applicationService as never as ApplicationService,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    workflowRunService.getWorkflowRunOrFail.mockResolvedValue({
      id: WORKFLOW_RUN_ID,
      createdBy: {
        source: FieldActorSource.WORKFLOW,
        workspaceMemberId: null,
      },
    });
    applicationService.findTwentyStandardApplicationOrThrow.mockResolvedValue({
      application: {
        id: APPLICATION_ID,
        defaultRoleId: null,
      },
      workspace: {
        id: WORKSPACE_ID,
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
        updatedAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    });
  });

  it('denies an application workflow when its current role is unresolved', async () => {
    applicationService.findApplicationRoleId.mockRejectedValue(
      new Error('application role unavailable'),
    );

    await expect(
      service.getExecutionContext({
        workflowRunId: WORKFLOW_RUN_ID,
        workspaceId: WORKSPACE_ID,
      }),
    ).rejects.toThrow('application role unavailable');
  });

  it('uses only the explicit same-workspace application role', async () => {
    applicationService.findApplicationRoleId.mockResolvedValue(ROLE_ID);

    const context = await service.getExecutionContext({
      workflowRunId: WORKFLOW_RUN_ID,
      workspaceId: WORKSPACE_ID,
    });

    expect(applicationService.findApplicationRoleId).toHaveBeenCalledWith(
      APPLICATION_ID,
      WORKSPACE_ID,
    );
    expect(context.rolePermissionConfig).toEqual({ unionOf: [ROLE_ID] });
    expect(context.rolePermissionConfig).not.toHaveProperty(
      'shouldBypassPermissionChecks',
    );
  });
});
