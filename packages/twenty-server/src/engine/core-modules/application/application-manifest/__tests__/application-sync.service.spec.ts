import { ALL_METADATA_NAME } from 'twenty-shared/metadata';

import { ApplicationSyncService } from 'src/engine/core-modules/application/application-manifest/application-sync.service';
import { createEmptyAllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-all-flat-entity-maps.constant';
import { getMetadataFlatEntityMapsKey } from 'src/engine/metadata-modules/flat-entity/utils/get-metadata-flat-entity-maps-key.util';
import { getDestructiveMetadataChangeExecutionContext } from 'src/engine/workspace-manager/workspace-migration/storage/destructive-metadata-change-execution-context.storage';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const APPLICATION_ID = '22222222-2222-4222-8222-222222222222';

describe('ApplicationSyncService', () => {
  it('stops an application before deletion and runtime cleanup', async () => {
    const applicationService = {
      findOneApplicationOrThrow: jest.fn().mockResolvedValue({
        id: APPLICATION_ID,
        universalIdentifier: APPLICATION_ID,
        canBeUninstalled: true,
      }),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const workspaceMigration = { actions: [] };
    const observedExecutionContexts: unknown[] = [];
    const workspaceMigrationValidateBuildAndRunService = {
      validateBuildAndRunWorkspaceMigrationFromTo: jest
        .fn()
        .mockImplementation(async () => {
          observedExecutionContexts.push(
            getDestructiveMetadataChangeExecutionContext(),
          );

          return { status: 'success', workspaceMigration };
        }),
    };
    const emptyFlatMaps = createEmptyAllFlatEntityMaps();
    const workspaceCacheService = {
      getOrRecompute: jest.fn().mockResolvedValue({
        ...Object.fromEntries(
          Object.values(ALL_METADATA_NAME).map((metadataName) => [
            getMetadataFlatEntityMapsKey(metadataName),
            emptyFlatMaps[getMetadataFlatEntityMapsKey(metadataName)],
          ]),
        ),
        featureFlagsMap: {},
      }),
    };
    const deleteApplicationResources = jest.fn().mockResolvedValue(undefined);
    const logicFunctionDriverFactory = {
      getCurrentDriver: jest
        .fn()
        .mockReturnValue({ deleteApplicationResources }),
    };
    const applicationUninstallService = {
      runUninstallHookBestEffort: jest.fn().mockResolvedValue(undefined),
    };
    const applicationStopService = {
      stop: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ApplicationSyncService(
      applicationService as never,
      {} as never,
      workspaceMigrationValidateBuildAndRunService as never,
      workspaceCacheService as never,
      {} as never,
      {} as never,
      logicFunctionDriverFactory as never,
      applicationUninstallService as never,
      {} as never,
      {} as never,
      applicationStopService as never,
    );

    await expect(
      service.uninstallApplication({
        workspaceId: WORKSPACE_ID,
        applicationUniversalIdentifier: APPLICATION_ID,
      }),
    ).resolves.toBe(workspaceMigration);

    expect(
      applicationUninstallService.runUninstallHookBestEffort,
    ).toHaveBeenCalled();
    expect(
      workspaceMigrationValidateBuildAndRunService.validateBuildAndRunWorkspaceMigrationFromTo,
    ).toHaveBeenCalledTimes(2);
    expect(
      workspaceMigrationValidateBuildAndRunService.validateBuildAndRunWorkspaceMigrationFromTo,
    ).toHaveBeenNthCalledWith(1, expect.objectContaining({ dryRun: true }));
    const dryRunFlatEntityMaps =
      workspaceMigrationValidateBuildAndRunService
        .validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[0][0]
        .fromToAllFlatEntityMaps;
    const applyFlatEntityMaps =
      workspaceMigrationValidateBuildAndRunService
        .validateBuildAndRunWorkspaceMigrationFromTo.mock.calls[1][0]
        .fromToAllFlatEntityMaps;

    expect(dryRunFlatEntityMaps).toEqual(applyFlatEntityMaps);
    expect(dryRunFlatEntityMaps).not.toBe(applyFlatEntityMaps);
    expect(
      workspaceMigrationValidateBuildAndRunService.validateBuildAndRunWorkspaceMigrationFromTo,
    ).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        buildOptions: expect.objectContaining({ isSystemBuild: false }),
        destructiveChangeAuthorization: {
          source: 'APPLICATION_MANIFEST',
          workspaceId: WORKSPACE_ID,
          applicationUniversalIdentifier: APPLICATION_ID,
        },
      }),
    );
    expect(observedExecutionContexts).toEqual([
      undefined,
      {
        source: 'APPLICATION_MANIFEST',
        workspaceId: WORKSPACE_ID,
        applicationUniversalIdentifier: APPLICATION_ID,
      },
    ]);
    expect(applicationStopService.stop).toHaveBeenCalledWith(
      APPLICATION_ID,
      WORKSPACE_ID,
    );
    expect(applicationService.delete).toHaveBeenCalledWith(
      APPLICATION_ID,
      WORKSPACE_ID,
    );
    expect(deleteApplicationResources).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      applicationUniversalIdentifier: APPLICATION_ID,
    });
    expect(
      applicationUninstallService.runUninstallHookBestEffort.mock
        .invocationCallOrder[0],
    ).toBeLessThan(applicationStopService.stop.mock.invocationCallOrder[0]);
    expect(
      applicationStopService.stop.mock.invocationCallOrder[0],
    ).toBeLessThan(deleteApplicationResources.mock.invocationCallOrder[0]);
    expect(deleteApplicationResources.mock.invocationCallOrder[0]).toBeLessThan(
      applicationService.delete.mock.invocationCallOrder[0],
    );
  });

  it('keeps the application stopped and installed when runtime cleanup fails', async () => {
    const applicationService = {
      findOneApplicationOrThrow: jest.fn().mockResolvedValue({
        id: APPLICATION_ID,
        universalIdentifier: APPLICATION_ID,
        canBeUninstalled: true,
      }),
      delete: jest.fn(),
    };
    const workspaceMigrationValidateBuildAndRunService = {
      validateBuildAndRunWorkspaceMigrationFromTo: jest.fn().mockResolvedValue({
        status: 'success',
        workspaceMigration: { actions: [] },
      }),
    };
    const emptyFlatMaps = createEmptyAllFlatEntityMaps();
    const workspaceCacheService = {
      getOrRecompute: jest.fn().mockResolvedValue({
        ...Object.fromEntries(
          Object.values(ALL_METADATA_NAME).map((metadataName) => [
            getMetadataFlatEntityMapsKey(metadataName),
            emptyFlatMaps[getMetadataFlatEntityMapsKey(metadataName)],
          ]),
        ),
        featureFlagsMap: {},
      }),
    };
    const deleteApplicationResources = jest
      .fn()
      .mockRejectedValue(new Error('resource cleanup unavailable'));
    const applicationStopService = {
      stop: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ApplicationSyncService(
      applicationService as never,
      {} as never,
      workspaceMigrationValidateBuildAndRunService as never,
      workspaceCacheService as never,
      {} as never,
      {} as never,
      {
        getCurrentDriver: jest
          .fn()
          .mockReturnValue({ deleteApplicationResources }),
      } as never,
      { runUninstallHookBestEffort: jest.fn() } as never,
      {} as never,
      {} as never,
      applicationStopService as never,
    );

    await expect(
      service.uninstallApplication({
        workspaceId: WORKSPACE_ID,
        applicationUniversalIdentifier: APPLICATION_ID,
      }),
    ).rejects.toMatchObject({ code: 'UNINSTALL_ERROR' });

    expect(applicationStopService.stop).toHaveBeenCalled();
    expect(deleteApplicationResources).toHaveBeenCalled();
    expect(applicationService.delete).not.toHaveBeenCalled();
    expect(
      workspaceMigrationValidateBuildAndRunService.validateBuildAndRunWorkspaceMigrationFromTo,
    ).toHaveBeenCalledTimes(1);
  });
});
