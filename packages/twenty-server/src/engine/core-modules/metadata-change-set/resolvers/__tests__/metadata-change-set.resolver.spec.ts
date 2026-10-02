import { MetadataChangeSetResolver } from 'src/engine/core-modules/metadata-change-set/resolvers/metadata-change-set.resolver';
import { withWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';

describe('MetadataChangeSetResolver', () => {
  const changeSetService = {
    acknowledgeDependencies: jest.fn(),
    createDraft: jest.fn(),
  };
  const deletionPlanService = { build: jest.fn() };
  const createResolver = () =>
    new MetadataChangeSetResolver(
      changeSetService as never,
      {} as never,
      deletionPlanService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

  it('denies identity-less system context before creating a draft', async () => {
    await expect(
      withWorkspaceAuthContext(
        {
          type: 'system',
          workspace: { id: WORKSPACE_ID } as never,
        },
        () =>
          createResolver().createMetadataChangeSet(
            {
              baseMetadataVersion: 8,
              applicationUniversalIdentifier: 'application-universal-id',
              migrationPlan: {},
            },
            { id: WORKSPACE_ID } as never,
          ),
      ),
    ).rejects.toThrow('caller-bound identity');
    expect(changeSetService.createDraft).not.toHaveBeenCalled();
  });

  it('denies a caller context bound to another workspace', async () => {
    await expect(
      withWorkspaceAuthContext(
        {
          type: 'user',
          workspace: {
            id: '22222222-2222-4222-8222-222222222222',
          } as never,
          user: { id: '33333333-3333-4333-8333-333333333333' } as never,
          userWorkspaceId: '44444444-4444-4444-8444-444444444444',
          workspaceMemberId: '55555555-5555-4555-8555-555555555555',
          workspaceMember: {} as never,
        },
        () =>
          createResolver().createMetadataChangeSet(
            {
              baseMetadataVersion: 8,
              applicationUniversalIdentifier: 'application-universal-id',
              migrationPlan: {},
            },
            { id: WORKSPACE_ID } as never,
          ),
      ),
    ).rejects.toThrow('workspace');
    expect(changeSetService.createDraft).not.toHaveBeenCalled();
  });

  it('creates a reversible draft for a caller-bound metadata deletion', async () => {
    const actorId = '33333333-3333-4333-8333-333333333333';
    const targetId = '44444444-4444-4444-8444-444444444444';
    const migrationPlan = { index: {} };
    const rollbackPlan = { index: {} };

    deletionPlanService.build.mockResolvedValue({
      applicationUniversalIdentifier: 'application-universal-id',
      migrationPlan,
      rollbackPlan,
    });
    changeSetService.createDraft.mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
      state: 'DRAFT',
      version: 1,
    });

    await expect(
      withWorkspaceAuthContext(
        {
          type: 'user',
          workspace: { id: WORKSPACE_ID } as never,
          user: { id: actorId } as never,
          userWorkspaceId: '66666666-6666-4666-8666-666666666666',
          workspaceMemberId: '77777777-7777-4777-8777-777777777777',
          workspaceMember: {} as never,
        },
        () =>
          createResolver().prepareMetadataDeletionChangeSet(
            { targetType: 'INDEX', targetId },
            { id: WORKSPACE_ID, metadataVersion: 12 } as never,
          ),
      ),
    ).resolves.toEqual(expect.objectContaining({ state: 'DRAFT', version: 1 }));
    expect(deletionPlanService.build).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      targetType: 'INDEX',
      targetId,
    });
    expect(changeSetService.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        baseMetadataVersion: 12,
        createdByActorId: actorId,
        migrationPlan,
        rollbackPlan,
        recoveryStrategy: 'ROLLBACK',
      }),
    );
  });

  it('records dependency acknowledgement only for a human workspace member', async () => {
    changeSetService.acknowledgeDependencies.mockResolvedValue({
      dependencyResolutionDigest: 'a'.repeat(64),
      version: 3,
    });

    await expect(
      withWorkspaceAuthContext(
        {
          type: 'user',
          workspace: { id: WORKSPACE_ID } as never,
          user: {
            id: '33333333-3333-4333-8333-333333333333',
          } as never,
          userWorkspaceId: '44444444-4444-4444-8444-444444444444',
          workspaceMemberId: '55555555-5555-4555-8555-555555555555',
          workspaceMember: {} as never,
        },
        () =>
          createResolver().acknowledgeMetadataChangeSetDependencies(
            '66666666-6666-4666-8666-666666666666',
            2,
            { id: WORKSPACE_ID } as never,
          ),
      ),
    ).resolves.toEqual({
      dependencyResolutionDigest: 'a'.repeat(64),
      version: 3,
    });
    expect(changeSetService.acknowledgeDependencies).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      id: '66666666-6666-4666-8666-666666666666',
      expectedVersion: 2,
    });
  });

  it('denies application dependency acknowledgement', async () => {
    await expect(
      withWorkspaceAuthContext(
        {
          type: 'application',
          workspace: { id: WORKSPACE_ID } as never,
          application: {
            id: '33333333-3333-4333-8333-333333333333',
          } as never,
        },
        () =>
          createResolver().acknowledgeMetadataChangeSetDependencies(
            '66666666-6666-4666-8666-666666666666',
            2,
            { id: WORKSPACE_ID } as never,
          ),
      ),
    ).rejects.toThrow('human workspace member');
    expect(changeSetService.acknowledgeDependencies).not.toHaveBeenCalled();
  });

  it('denies application-triggered rollback before loading the change set', async () => {
    await expect(
      withWorkspaceAuthContext(
        {
          type: 'application',
          workspace: { id: WORKSPACE_ID } as never,
          application: {
            id: '33333333-3333-4333-8333-333333333333',
          } as never,
        },
        () =>
          createResolver().rollbackMetadataChangeSet(
            '66666666-6666-4666-8666-666666666666',
            6,
            'APPLIED',
            'rollback-token',
            '77777777-7777-4777-8777-777777777777',
            { id: WORKSPACE_ID } as never,
          ),
      ),
    ).rejects.toThrow('human workspace member');
  });
});
