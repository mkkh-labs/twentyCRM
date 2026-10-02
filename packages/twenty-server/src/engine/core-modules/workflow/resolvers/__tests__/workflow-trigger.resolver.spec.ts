import { withWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { WorkflowTriggerResolver } from 'src/engine/core-modules/workflow/resolvers/workflow-trigger.resolver';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const WORKSPACE_MEMBER_ID = '33333333-3333-4333-8333-333333333333';
const WORKFLOW_VERSION_ID = '44444444-4444-4444-8444-444444444444';

describe('WorkflowTriggerResolver', () => {
  it('uses the authenticated workspace member without a bypassed lookup', async () => {
    const rolePermissionConfig = { unionOf: ['role-id'] };
    const authContext = {
      type: 'user' as const,
      workspace: { id: WORKSPACE_ID } as never,
      user: { id: USER_ID } as never,
      userWorkspaceId: 'user-workspace-id',
      workspaceMemberId: WORKSPACE_MEMBER_ID,
      workspaceMember: {
        id: WORKSPACE_MEMBER_ID,
        name: { firstName: 'MIKKOH', lastName: 'Chen' },
      } as never,
    };
    const workspaceOrmManager = {
      resolveRolePermissionConfigForAuthContext: jest
        .fn()
        .mockResolvedValue(rolePermissionConfig),
      executeInWorkspaceContext: jest
        .fn()
        .mockResolvedValue(authContext.workspaceMember),
    };
    const workflowTriggerWorkspaceService = {
      runWorkflowVersion: jest
        .fn()
        .mockResolvedValue({ workflowRunId: 'run-id' }),
    };
    const resolver = new WorkflowTriggerResolver(
      workspaceOrmManager as never,
      workflowTriggerWorkspaceService as never,
    );

    await withWorkspaceAuthContext(authContext, () =>
      resolver.runWorkflowVersion(
        { id: USER_ID } as never,
        { id: WORKSPACE_ID } as never,
        { workflowVersionId: WORKFLOW_VERSION_ID } as never,
      ),
    );

    expect(
      workspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
    expect(
      workflowTriggerWorkspaceService.runWorkflowVersion,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        authContext,
        rolePermissionConfig,
        workspaceId: WORKSPACE_ID,
        workflowVersionId: WORKFLOW_VERSION_ID,
      }),
    );
  });
});
