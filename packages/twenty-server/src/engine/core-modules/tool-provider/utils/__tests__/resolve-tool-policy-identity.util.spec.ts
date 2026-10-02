import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { resolveToolPolicyIdentity } from 'src/engine/core-modules/tool-provider/utils/resolve-tool-policy-identity.util';

describe('resolveToolPolicyIdentity', () => {
  const workspaceId = '20202020-0000-4000-8000-000000000001';
  const userId = '20202020-0000-4000-8000-000000000002';
  const workspaceMemberId = '20202020-0000-4000-8000-000000000003';

  const userAuthContext = {
    type: 'user',
    workspace: { id: workspaceId },
    user: { id: userId },
    userWorkspaceId: '20202020-0000-4000-8000-000000000004',
    workspaceMemberId,
    workspaceMember: { id: workspaceMemberId },
  } as unknown as WorkspaceAuthContext;

  it('binds caller authority to the authenticated workspace and role', () => {
    const result = resolveToolPolicyIdentity({
      workspaceId,
      roleId: 'role-1',
      rolePermissionConfig: { unionOf: ['role-1'] },
      authContext: userAuthContext,
      operation: 'database.find_many',
    });

    expect(result.actor).toMatchObject({
      type: 'user',
      id: userId,
      workspaceId,
      workspaceMemberId,
    });
    expect(result.authority).toMatchObject({
      type: 'roles',
      source: 'CALLER_BOUND',
      authorityVersion: 'role:role-1',
    });
  });

  it('rejects a cross-workspace identity', () => {
    expect(() =>
      resolveToolPolicyIdentity({
        workspaceId: '20202020-0000-4000-8000-000000000099',
        roleId: 'role-1',
        rolePermissionConfig: { unionOf: ['role-1'] },
        authContext: userAuthContext,
        operation: 'database.find_many',
      }),
    ).toThrow('another workspace');
  });

  it('rejects a runtime bypass-bearing role configuration', () => {
    expect(() =>
      resolveToolPolicyIdentity({
        workspaceId,
        roleId: 'role-1',
        rolePermissionConfig: {
          shouldBypassPermissionChecks: true,
        } as never,
        authContext: userAuthContext,
        operation: 'database.find_many',
      }),
    ).toThrow('Permission bypass is forbidden');
  });

  it('requires explicit service authority for system execution', () => {
    const systemContext = {
      type: 'system',
      workspace: { id: workspaceId },
    } as unknown as WorkspaceAuthContext;

    expect(() =>
      resolveToolPolicyIdentity({
        workspaceId,
        roleId: 'role-1',
        rolePermissionConfig: { unionOf: ['role-1'] },
        authContext: systemContext,
        operation: 'database.find_many',
      }),
    ).toThrow('requires scoped service authority');
  });
});
