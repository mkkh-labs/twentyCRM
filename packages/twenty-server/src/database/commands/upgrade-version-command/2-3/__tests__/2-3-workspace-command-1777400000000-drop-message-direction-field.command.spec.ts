import { type WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { DropMessageDirectionFieldCommand } from 'src/database/commands/upgrade-version-command/2-3/2-3-workspace-command-1777400000000-drop-message-direction-field.command';
import { type ApplicationService } from 'src/engine/core-modules/application/application.service';
import { type WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { type WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const APPLICATION_UNIVERSAL_IDENTIFIER =
  '22222222-2222-4222-8222-222222222222';
const MESSAGE_DIRECTION_FIELD_ID = '33333333-3333-4333-8333-333333333333';
const MESSAGE_DIRECTION_FIELD_UNIVERSAL_IDENTIFIER =
  '20202020-0203-4118-8e2a-05b9bdae6dab';

describe('DropMessageDirectionFieldCommand', () => {
  it('submits the destructive upgrade as a system build', async () => {
    const directionFieldMetadata = {
      id: MESSAGE_DIRECTION_FIELD_ID,
      universalIdentifier: MESSAGE_DIRECTION_FIELD_UNIVERSAL_IDENTIFIER,
    };
    const validateBuildAndRunLegacyWorkspaceMigration = jest
      .fn()
      .mockResolvedValue({ status: 'success' });
    const command = new DropMessageDirectionFieldCommand(
      {} as WorkspaceIteratorService,
      {
        findWorkspaceTwentyStandardAndCustomApplicationOrThrow: jest
          .fn()
          .mockResolvedValue({
            twentyStandardFlatApplication: {
              universalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
            },
          }),
      } as unknown as ApplicationService,
      {
        validateBuildAndRunLegacyWorkspaceMigration,
      } as unknown as WorkspaceMigrationValidateBuildAndRunService,
      {
        getOrRecompute: jest.fn().mockResolvedValue({
          flatFieldMetadataMaps: {
            byUniversalIdentifier: {
              [MESSAGE_DIRECTION_FIELD_UNIVERSAL_IDENTIFIER]:
                directionFieldMetadata,
            },
          },
        }),
      } as unknown as WorkspaceCacheService,
    );

    await command.runOnWorkspace({
      workspaceId: WORKSPACE_ID,
      options: {},
      index: 0,
      total: 1,
    });

    expect(validateBuildAndRunLegacyWorkspaceMigration).toHaveBeenCalledWith({
      isSystemBuild: true,
      workspaceId: WORKSPACE_ID,
      applicationUniversalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
      allFlatEntityOperationByMetadataName: {
        fieldMetadata: {
          flatEntityToCreate: [],
          flatEntityToDelete: [directionFieldMetadata],
          flatEntityToUpdate: [],
        },
      },
    });
  });
});
