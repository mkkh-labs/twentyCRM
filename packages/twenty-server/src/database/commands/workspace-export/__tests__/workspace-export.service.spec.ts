import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { WorkspaceExportService } from 'src/database/commands/workspace-export/workspace-export.service';
import { ConfigurationVersionEntity } from 'src/engine/core-modules/configuration-version/entities/configuration-version.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';

describe('WorkspaceExportService', () => {
  it('commits the read-only export snapshot exactly once', async () => {
    const outputPath = await mkdtemp(join(tmpdir(), 'twenty-export-test-'));
    let isTransactionActive = false;
    const commitTransaction = jest.fn(async () => {
      isTransactionActive = false;
    });
    const emptyRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
    };
    const queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(async () => {
        isTransactionActive = true;
      }),
      query: jest.fn().mockResolvedValue([]),
      commitTransaction,
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      get isTransactionActive() {
        return isTransactionActive;
      },
      manager: {
        getRepository: jest.fn((entity) => {
          if (entity === WorkspaceEntity) {
            return {
              findOne: jest.fn().mockResolvedValue({
                id: '11111111-1111-4111-8111-111111111111',
              }),
            };
          }

          if (entity === ConfigurationVersionEntity) {
            return { findOne: jest.fn().mockResolvedValue(null) };
          }

          return emptyRepository;
        }),
      },
    };
    const service = new WorkspaceExportService({
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
      entityMetadatas: [],
    } as never);

    try {
      const result = await service.exportWorkspace({
        workspaceId: '11111111-1111-4111-8111-111111111111',
        outputPath,
        encryptionSecret: 'test-export-secret-at-least-32-characters',
      });

      expect(result.manifest.workspaceId).toBe(
        '11111111-1111-4111-8111-111111111111',
      );
      expect(commitTransaction).toHaveBeenCalledTimes(1);
      expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    } finally {
      await rm(outputPath, { recursive: true, force: true });
    }
  });
});
