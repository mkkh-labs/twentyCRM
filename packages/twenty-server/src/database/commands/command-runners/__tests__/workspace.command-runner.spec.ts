import { WorkspaceActivationStatus } from 'twenty-shared/workspace';

import { type WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import {
  WorkspaceCommandRunner,
  type RunOnWorkspaceArgs,
} from 'src/database/commands/command-runners/workspace.command-runner';
import { getDestructiveMetadataChangeExecutionContext } from 'src/engine/workspace-manager/workspace-migration/storage/destructive-metadata-change-execution-context.storage';

class TestWorkspaceCommandRunner extends WorkspaceCommandRunner {
  public executionContext: ReturnType<
    typeof getDestructiveMetadataChangeExecutionContext
  >;

  constructor(workspaceIteratorService: WorkspaceIteratorService) {
    super(workspaceIteratorService, [WorkspaceActivationStatus.ACTIVE]);
  }

  public runOnWorkspace(_args: RunOnWorkspaceArgs): Promise<void> {
    this.executionContext = getDestructiveMetadataChangeExecutionContext();

    return Promise.resolve();
  }
}

describe('WorkspaceCommandRunner', () => {
  it('fails the command when any workspace execution fails', async () => {
    const workspaceIteratorService = {
      listenToShutdownSignals: jest.fn(),
      iterate: jest.fn().mockResolvedValue({
        success: [],
        fail: [
          {
            workspaceId: '20202020-0000-4000-8000-000000000001',
            error: new Error('workspace failure'),
          },
        ],
        interrupted: false,
      }),
    } as unknown as WorkspaceIteratorService;
    const command = new TestWorkspaceCommandRunner(workspaceIteratorService);

    await expect(command.run([], {})).rejects.toThrow(
      '1 workspace command execution(s) failed',
    );
  });

  it('does not fail an intentionally interrupted command', async () => {
    const workspaceIteratorService = {
      listenToShutdownSignals: jest.fn(),
      iterate: jest.fn().mockResolvedValue({
        success: [],
        fail: [],
        interrupted: true,
      }),
    } as unknown as WorkspaceIteratorService;
    const command = new TestWorkspaceCommandRunner(workspaceIteratorService);

    await expect(command.run([], {})).resolves.toBeUndefined();
  });

  it('binds workspace commands to a system metadata execution context', async () => {
    const workspaceId = '20202020-0000-4000-8000-000000000001';
    const workspaceIteratorService = {
      listenToShutdownSignals: jest.fn(),
      iterate: jest.fn().mockImplementation(async ({ callback }) => {
        await callback({ workspaceId, index: 0, total: 1 });

        return { success: [workspaceId], fail: [], interrupted: false };
      }),
    } as unknown as WorkspaceIteratorService;
    const command = new TestWorkspaceCommandRunner(workspaceIteratorService);

    await command.run([], {});

    expect(command.executionContext).toEqual({
      source: 'SYSTEM_BUILD',
      workspaceId,
      operationId: 'TestWorkspaceCommandRunner',
    });
  });
});
