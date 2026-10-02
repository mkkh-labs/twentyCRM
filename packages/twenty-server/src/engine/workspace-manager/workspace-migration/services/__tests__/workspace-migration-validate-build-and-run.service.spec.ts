import { WorkspaceMigrationV2ExceptionCode } from 'twenty-shared/metadata';

import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';
import { withDestructiveMetadataChangeExecutionContext } from 'src/engine/workspace-manager/workspace-migration/storage/destructive-metadata-change-execution-context.storage';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const APPLICATION_UNIVERSAL_IDENTIFIER = '33333333-3333-4333-8333-333333333333';
const BASE_ARGS = {
  workspaceId: WORKSPACE_ID,
  fromToAllFlatEntityMaps: {},
  additionalCacheDataMaps: { featureFlagsMap: {} as never },
};

const buildService = () => {
  const workspaceMigrationRunnerService = {
    run: jest.fn().mockResolvedValue({
      hasSchemaMetadataChanged: true,
      metadataEvents: [],
    }),
  };
  const workspaceMigrationBuildOrchestratorService = {
    buildWorkspaceMigration: jest.fn().mockResolvedValue({
      status: 'success',
      workspaceMigration: {
        actions: [
          {
            type: 'delete',
            metadataName: 'objectMetadata',
            universalIdentifier: '22222222-2222-4222-8222-222222222222',
          },
        ],
      },
    }),
  };
  const service = new WorkspaceMigrationValidateBuildAndRunService(
    workspaceMigrationRunnerService as never,
    workspaceMigrationBuildOrchestratorService as never,
    {} as never,
    { emitMetadataEvents: jest.fn() } as never,
    {} as never,
    { recordHistogram: jest.fn() } as never,
    { perf: jest.fn(), error: jest.fn() } as never,
    { get: jest.fn().mockReturnValue([]) } as never,
  );

  return { service, workspaceMigrationRunnerService };
};

describe('WorkspaceMigrationValidateBuildAndRunService', () => {
  it('denies a destructive caller migration before the runner executes', async () => {
    const { service, workspaceMigrationRunnerService } = buildService();

    await expect(
      service.validateBuildAndRunWorkspaceMigrationFromTo({
        ...BASE_ARGS,
        buildOptions: {
          isSystemBuild: false,
          applicationUniversalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
        },
      }),
    ).rejects.toMatchObject({
      code: WorkspaceMigrationV2ExceptionCode.CHANGE_SET_REQUIRED,
    });
    expect(workspaceMigrationRunnerService.run).not.toHaveBeenCalled();
  });

  it('denies a system build without an active system execution context', async () => {
    const { service, workspaceMigrationRunnerService } = buildService();

    await expect(
      service.validateBuildAndRunWorkspaceMigrationFromTo({
        ...BASE_ARGS,
        buildOptions: {
          isSystemBuild: true,
          applicationUniversalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
        },
      }),
    ).rejects.toMatchObject({
      code: WorkspaceMigrationV2ExceptionCode.CHANGE_SET_REQUIRED,
    });
    expect(workspaceMigrationRunnerService.run).not.toHaveBeenCalled();
  });

  it('runs a system build bound to the active system execution context', async () => {
    const { service, workspaceMigrationRunnerService } = buildService();
    const operationId = 'workspace-upgrade';

    await expect(
      withDestructiveMetadataChangeExecutionContext(
        { source: 'SYSTEM_BUILD', workspaceId: WORKSPACE_ID, operationId },
        () =>
          service.validateBuildAndRunWorkspaceMigrationFromTo({
            ...BASE_ARGS,
            buildOptions: {
              isSystemBuild: true,
              applicationUniversalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
            },
            destructiveChangeAuthorization: {
              source: 'SYSTEM_BUILD',
              workspaceId: WORKSPACE_ID,
              operationId,
            },
          }),
      ),
    ).resolves.toMatchObject({ status: 'success' });
    expect(workspaceMigrationRunnerService.run).toHaveBeenCalledTimes(1);
  });

  it('derives system authorization only from the active execution context', async () => {
    const { service, workspaceMigrationRunnerService } = buildService();
    const operationId = 'workspace-upgrade';

    await expect(
      withDestructiveMetadataChangeExecutionContext(
        { source: 'SYSTEM_BUILD', workspaceId: WORKSPACE_ID, operationId },
        () =>
          service.validateBuildAndRunWorkspaceMigrationFromTo({
            ...BASE_ARGS,
            buildOptions: {
              isSystemBuild: true,
              applicationUniversalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
            },
          }),
      ),
    ).resolves.toMatchObject({ status: 'success' });
    expect(workspaceMigrationRunnerService.run).toHaveBeenCalledTimes(1);
  });

  it('runs an application manifest bound to its active execution context', async () => {
    const { service, workspaceMigrationRunnerService } = buildService();

    await expect(
      withDestructiveMetadataChangeExecutionContext(
        {
          source: 'APPLICATION_MANIFEST',
          workspaceId: WORKSPACE_ID,
          applicationUniversalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
        },
        () =>
          service.validateBuildAndRunWorkspaceMigrationFromTo({
            ...BASE_ARGS,
            buildOptions: {
              isSystemBuild: false,
              applicationUniversalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
            },
            destructiveChangeAuthorization: {
              source: 'APPLICATION_MANIFEST',
              workspaceId: WORKSPACE_ID,
              applicationUniversalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
            },
          }),
      ),
    ).resolves.toMatchObject({ status: 'success' });
    expect(workspaceMigrationRunnerService.run).toHaveBeenCalledTimes(1);
  });
});
