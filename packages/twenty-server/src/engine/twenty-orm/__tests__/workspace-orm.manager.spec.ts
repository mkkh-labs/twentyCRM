import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

const WORKSPACE_ID = '20202020-1c25-4d02-bf25-6aeccf7ea419';

describe('WorkspaceOrmManager', () => {
  it('propagates an explicit auth context with the ORM workspace context', async () => {
    const workspaceCacheService = {
      getOrRecompute: jest.fn().mockResolvedValue({
        flatObjectMetadataMaps: {
          byUniversalIdentifier: {},
          universalIdentifierById: {},
          universalIdentifiersByApplicationId: {},
        },
        flatFieldMetadataMapsOrm: {
          byUniversalIdentifier: {},
          universalIdentifierById: {},
          universalIdentifiersByApplicationId: {},
        },
      }),
    };
    const manager = new WorkspaceOrmManager(
      workspaceCacheService as unknown as WorkspaceCacheService,
      {} as never,
    );
    const authContext = {
      type: 'application',
      workspace: { id: WORKSPACE_ID },
      application: {
        id: '276087fb-5677-4d8e-b798-86eddb9ca90b',
      },
    } as WorkspaceAuthContext;

    await manager.executeInWorkspaceContext(
      () => {
        expect(getWorkspaceAuthContext()).toBe(authContext);
        expect(getWorkspaceContext().authContext).toBe(authContext);
      },
      authContext,
      { lite: true },
    );
  });
});
