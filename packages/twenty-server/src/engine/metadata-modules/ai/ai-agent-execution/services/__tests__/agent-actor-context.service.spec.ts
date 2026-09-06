import { AgentActorContextService } from 'src/engine/metadata-modules/ai/ai-agent-execution/services/agent-actor-context.service';

describe('AgentActorContextService authority boundary', () => {
  const buildDependencies = () => {
    const userWorkspaceService = {
      findById: jest.fn().mockResolvedValue({
        id: 'user-workspace-1',
        userId: 'user-1',
        workspaceId: 'workspace-1',
        locale: 'en',
      }),
      getUserWorkspaceForUser: jest.fn().mockResolvedValue({
        id: 'user-workspace-1',
        userId: 'user-1',
        workspaceId: 'workspace-1',
        workspace: {
          id: 'workspace-1',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        user: {
          id: 'user-1',
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@example.com',
          isEmailVerified: true,
          disabled: false,
          canImpersonate: false,
          canAccessFullAdminPanel: false,
          locale: 'en',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          deletedAt: null,
        },
      }),
    };
    const userRoleService = {
      getRoleIdForUserWorkspace: jest.fn().mockResolvedValue('role-1'),
    };
    const workspaceCacheService = {
      getOrRecompute: jest.fn().mockResolvedValue({
        flatWorkspaceMemberMaps: {
          idByUserId: { 'user-1': 'workspace-member-1' },
          byId: {
            'workspace-member-1': {
              id: 'workspace-member-1',
              userId: 'user-1',
              name: { firstName: 'Jane', lastName: 'Doe' },
              jobTitle: 'Operator',
              timeZone: 'America/New_York',
              deletedAt: null,
            },
          },
        },
      }),
    };

    return {
      userWorkspaceService,
      userRoleService,
      workspaceCacheService,
    };
  };

  it('resolves a current workspace member only after current role validation', async () => {
    const dependencies = buildDependencies();
    const service = new AgentActorContextService(
      dependencies.userWorkspaceService as never,
      dependencies.userRoleService as never,
      dependencies.workspaceCacheService as never,
    );

    await expect(
      service.buildUserAndAgentActorContext('user-workspace-1', 'workspace-1'),
    ).resolves.toMatchObject({
      roleId: 'role-1',
      userId: 'user-1',
      userWorkspaceId: 'user-workspace-1',
      userContext: {
        firstName: 'Jane',
        lastName: 'Doe',
        jobTitle: 'Operator',
        locale: 'en',
        timezone: 'America/New_York',
      },
    });

    expect(
      dependencies.userRoleService.getRoleIdForUserWorkspace,
    ).toHaveBeenCalledWith({
      userWorkspaceId: 'user-workspace-1',
      workspaceId: 'workspace-1',
    });
    expect(
      dependencies.workspaceCacheService.getOrRecompute,
    ).toHaveBeenCalledWith('workspace-1', ['flatWorkspaceMemberMaps']);
    expect(
      dependencies.userRoleService.getRoleIdForUserWorkspace.mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      dependencies.workspaceCacheService.getOrRecompute.mock
        .invocationCallOrder[0],
    );
  });

  it('denies a missing role before resolving workspace member identity', async () => {
    const dependencies = buildDependencies();

    dependencies.userRoleService.getRoleIdForUserWorkspace.mockResolvedValue(
      undefined,
    );

    const service = new AgentActorContextService(
      dependencies.userWorkspaceService as never,
      dependencies.userRoleService as never,
      dependencies.workspaceCacheService as never,
    );

    await expect(
      service.buildUserAndAgentActorContext('user-workspace-1', 'workspace-1'),
    ).rejects.toThrow('User role not found');

    expect(
      dependencies.workspaceCacheService.getOrRecompute,
    ).not.toHaveBeenCalled();
  });

  it('denies when the current workspace identity cache has no member', async () => {
    const dependencies = buildDependencies();

    dependencies.workspaceCacheService.getOrRecompute.mockResolvedValue({
      flatWorkspaceMemberMaps: { idByUserId: {}, byId: {} },
    });

    const service = new AgentActorContextService(
      dependencies.userWorkspaceService as never,
      dependencies.userRoleService as never,
      dependencies.workspaceCacheService as never,
    );

    await expect(
      service.buildUserAndAgentActorContext('user-workspace-1', 'workspace-1'),
    ).rejects.toThrow('Workspace member not found for user');
  });

  it('denies a workspace member cache entry bound to another user', async () => {
    const dependencies = buildDependencies();

    dependencies.workspaceCacheService.getOrRecompute.mockResolvedValue({
      flatWorkspaceMemberMaps: {
        idByUserId: { 'user-1': 'workspace-member-foreign' },
        byId: {
          'workspace-member-foreign': {
            id: 'workspace-member-foreign',
            userId: 'user-foreign',
          },
        },
      },
    });

    const service = new AgentActorContextService(
      dependencies.userWorkspaceService as never,
      dependencies.userRoleService as never,
      dependencies.workspaceCacheService as never,
    );

    await expect(
      service.buildUserAndAgentActorContext('user-workspace-1', 'workspace-1'),
    ).rejects.toThrow('Workspace member not found for user');
  });

  it('builds run-as authority from an active tenant-bound cache identity', async () => {
    const dependencies = buildDependencies();
    const service = new AgentActorContextService(
      dependencies.userWorkspaceService as never,
      dependencies.userRoleService as never,
      dependencies.workspaceCacheService as never,
    );

    await expect(
      service.buildRunAsWorkspaceMemberContext({
        workspaceMemberId: 'workspace-member-1',
        workspaceId: 'workspace-1',
      }),
    ).resolves.toMatchObject({
      roleId: 'role-1',
      actorContext: { workspaceMemberId: 'workspace-member-1' },
      authContext: {
        type: 'user',
        userWorkspaceId: 'user-workspace-1',
        workspaceMemberId: 'workspace-member-1',
        workspace: { id: 'workspace-1' },
      },
    });

    expect(
      dependencies.userWorkspaceService.getUserWorkspaceForUser,
    ).toHaveBeenCalledWith({
      userId: 'user-1',
      workspaceId: 'workspace-1',
      relations: ['workspace', 'user'],
    });
  });

  it('denies a deleted run-as member before loading core user authority', async () => {
    const dependencies = buildDependencies();

    dependencies.workspaceCacheService.getOrRecompute.mockResolvedValue({
      flatWorkspaceMemberMaps: {
        idByUserId: { 'user-1': 'workspace-member-1' },
        byId: {
          'workspace-member-1': {
            id: 'workspace-member-1',
            userId: 'user-1',
            deletedAt: new Date('2026-01-02T00:00:00.000Z'),
          },
        },
      },
    });

    const service = new AgentActorContextService(
      dependencies.userWorkspaceService as never,
      dependencies.userRoleService as never,
      dependencies.workspaceCacheService as never,
    );

    await expect(
      service.buildRunAsWorkspaceMemberContext({
        workspaceMemberId: 'workspace-member-1',
        workspaceId: 'workspace-1',
      }),
    ).rejects.toThrow('Workspace member workspace-member-1 not found');

    expect(
      dependencies.userWorkspaceService.getUserWorkspaceForUser,
    ).not.toHaveBeenCalled();
  });

  it('rejects a user-workspace identity from another workspace before privileged lookup', async () => {
    const userWorkspaceService = {
      findById: jest.fn().mockResolvedValue({
        id: 'user-workspace-1',
        userId: 'user-1',
        workspaceId: 'workspace-foreign',
      }),
    };
    const userRoleService = {
      getRoleIdForUserWorkspace: jest.fn(),
    };
    const workspaceCacheService = {
      getOrRecompute: jest.fn(),
    };
    const service = new AgentActorContextService(
      userWorkspaceService as never,
      userRoleService as never,
      workspaceCacheService as never,
    );

    await expect(
      service.buildUserAndAgentActorContext(
        'user-workspace-1',
        'workspace-requested',
      ),
    ).rejects.toThrow('User workspace not found in the requested workspace');

    expect(userRoleService.getRoleIdForUserWorkspace).not.toHaveBeenCalled();
    expect(workspaceCacheService.getOrRecompute).not.toHaveBeenCalled();
  });
});
