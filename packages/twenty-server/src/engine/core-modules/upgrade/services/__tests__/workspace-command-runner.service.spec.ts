import { getDestructiveMetadataChangeExecutionContext } from 'src/engine/workspace-manager/workspace-migration/storage/destructive-metadata-change-execution-context.storage';

import { WorkspaceCommandRunnerService } from '../workspace-command-runner.service';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const OPERATION_ID = '2.3.0_DropMessageDirectionFieldCommand_1777400000000';

describe('WorkspaceCommandRunnerService', () => {
  it('binds each workspace command to its registered upgrade operation', async () => {
    let executionContext: ReturnType<
      typeof getDestructiveMetadataChangeExecutionContext
    >;
    const workspaceCommand = {
      runOnWorkspace: jest.fn().mockImplementation(() => {
        executionContext = getDestructiveMetadataChangeExecutionContext();

        return Promise.resolve();
      }),
    };
    const service = new WorkspaceCommandRunnerService(
      { get: jest.fn().mockReturnValue('2.38.0') } as never,
      { recordUpgradeMigration: jest.fn() } as never,
      { invalidateInstanceAndAllWorkspacesStatus: jest.fn() } as never,
    );

    await service.runWorkspaceCommands({
      iteratorContext: {
        workspaceId: WORKSPACE_ID,
        index: 0,
        total: 1,
      },
      options: { dryRun: true },
      workspaceCommands: [
        {
          name: OPERATION_ID,
          command: workspaceCommand as never,
        },
      ],
    });

    expect(executionContext).toEqual({
      source: 'SYSTEM_BUILD',
      workspaceId: WORKSPACE_ID,
      operationId: OPERATION_ID,
    });
  });

  it('does not retain upgrade authority after a workspace command completes', async () => {
    const service = new WorkspaceCommandRunnerService(
      { get: jest.fn().mockReturnValue('2.38.0') } as never,
      { recordUpgradeMigration: jest.fn() } as never,
      { invalidateInstanceAndAllWorkspacesStatus: jest.fn() } as never,
    );

    await service.runWorkspaceCommands({
      iteratorContext: {
        workspaceId: WORKSPACE_ID,
        index: 0,
        total: 1,
      },
      options: { dryRun: true },
      workspaceCommands: [
        {
          name: OPERATION_ID,
          command: {
            runOnWorkspace: jest.fn().mockResolvedValue(undefined),
          } as never,
        },
      ],
    });

    expect(getDestructiveMetadataChangeExecutionContext()).toBeUndefined();
  });
});
