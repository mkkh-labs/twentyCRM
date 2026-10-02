import { DataSeedWorkspaceCommand } from 'src/database/commands/data-seed-dev-workspace.command';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';

describe('DataSeedWorkspaceCommand', () => {
  it('seeds the requested development workspace', async () => {
    const devSeederService = {
      seedDev: jest.fn(),
    };
    const command = new DataSeedWorkspaceCommand(devSeederService as never);

    await command.run([], { light: true });

    expect(devSeederService.seedDev).toHaveBeenCalledWith(
      SEED_APPLE_WORKSPACE_ID,
      { light: true },
    );
  });

  it('propagates seed failures to the command runner', async () => {
    const devSeederService = {
      seedDev: jest.fn().mockRejectedValue(new Error('seed failed')),
    };
    const command = new DataSeedWorkspaceCommand(devSeederService as never);

    await expect(command.run([], { light: true })).rejects.toThrow(
      'seed failed',
    );
  });
});
