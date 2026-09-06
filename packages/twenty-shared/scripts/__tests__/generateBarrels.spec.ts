import { execFile } from 'child_process';
import path from 'path';

const WORKSPACE_ROOT = path.resolve(__dirname, '../../../..');
const GENERATE_BARRELS_SCRIPT_PATH = path.join(
  WORKSPACE_ROOT,
  'packages/twenty-shared/scripts/generateBarrels.ts',
);

const runGenerateBarrels = () =>
  new Promise<void>((resolve, reject) => {
    execFile(
      process.execPath,
      ['--import', 'tsx', GENERATE_BARRELS_SCRIPT_PATH],
      {
        cwd: WORKSPACE_ROOT,
        env: {
          ...process.env,
          FORCE_COLOR: 'true',
          NO_COLOR: '1',
        },
        timeout: 3_000,
      },
      (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      },
    );
  });

describe('generateBarrels', () => {
  it('exits when Nx forces color in a no-color environment', async () => {
    await expect(runGenerateBarrels()).resolves.toBeUndefined();
  }, 10_000);
});
