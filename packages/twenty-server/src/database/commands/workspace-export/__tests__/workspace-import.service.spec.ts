import { randomBytes } from 'crypto';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { spawn } from 'child_process';
import { PassThrough } from 'stream';
import { type DataSource } from 'typeorm';

import { WorkspaceImportService } from 'src/database/commands/workspace-export/workspace-import.service';
import { type WorkspacePortableExportManifest } from 'src/database/commands/workspace-export/types/workspace-portable-export-manifest.type';
import { computeFileSha256 } from 'src/database/commands/workspace-export/utils/compute-file-sha256.util';
import {
  createWorkspaceExportCipher,
  deriveWorkspaceExportKey,
} from 'src/database/commands/workspace-export/utils/workspace-portable-export-crypto.util';
import { type TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

jest.mock('child_process', () => ({ spawn: jest.fn() }));

const WORKSPACE_ID = '20202020-b374-4779-a561-80086cb2a73d';
const ENCRYPTION_SECRET = 'test-only-secret-at-least-32-characters';

const createBundle = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workspace-import-test-'));
  const artifactFilePath = join(directory, 'workspace.sql.enc');
  const manifestFilePath = join(directory, 'workspace.manifest.json');
  const salt = randomBytes(16);
  const initializationVector = randomBytes(12);
  const cipher = createWorkspaceExportCipher(
    deriveWorkspaceExportKey(ENCRYPTION_SECRET, salt),
    initializationVector,
  );
  const ciphertext = Buffer.concat([
    cipher.update('SELECT 1;'),
    cipher.final(),
  ]);

  await writeFile(artifactFilePath, ciphertext);

  const manifest: WorkspacePortableExportManifest = {
    schemaVersion: 1,
    exportId: '10101010-b374-4779-a561-80086cb2a73d',
    rootCorrelationId: '11111111-b374-4779-a561-80086cb2a73d',
    platformVersion: '2.38.0',
    workspaceId: WORKSPACE_ID,
    workspaceSchemaName: getWorkspaceSchemaName(WORKSPACE_ID),
    createdAt: '2026-09-01T12:00:00.000Z',
    configurationVersion: null,
    scope: { type: 'FULL', tables: [] },
    artifact: {
      fileName: 'workspace.sql.enc',
      cipher: 'AES-256-GCM',
      keyDerivation: 'SCRYPT',
      salt: salt.toString('hex'),
      initializationVector: initializationVector.toString('hex'),
      authenticationTag: cipher.getAuthTag().toString('hex'),
      sha256: await computeFileSha256(artifactFilePath),
      containsSensitiveData: true,
    },
  };

  await writeFile(manifestFilePath, JSON.stringify(manifest));

  return { directory, manifestFilePath, manifest };
};

const createService = (workspaceFindOne: jest.Mock) => {
  const repository = { findOne: workspaceFindOne };
  const dataSource = {
    getRepository: jest.fn(() => repository),
  } as unknown as DataSource;
  const twentyConfigService = {
    get: jest.fn(() => 'postgres://test'),
  } as unknown as TwentyConfigService;

  return new WorkspaceImportService(dataSource, twentyConfigService);
};

describe('WorkspaceImportService', () => {
  afterEach(() => jest.clearAllMocks());

  it('rejects a duplicate workspace before decrypting or executing SQL', async () => {
    const bundle = await createBundle();
    const service = createService(
      jest.fn().mockResolvedValue({ id: WORKSPACE_ID }),
    );

    try {
      await expect(
        service.importWorkspace({
          manifestFilePath: bundle.manifestFilePath,
          encryptionSecret: ENCRYPTION_SECRET,
        }),
      ).rejects.toThrow('already exists');
      expect(spawn).not.toHaveBeenCalled();
    } finally {
      await rm(bundle.directory, { recursive: true, force: true });
    }
  });

  it('rejects failed authentication before executing SQL', async () => {
    const bundle = await createBundle();
    const service = createService(jest.fn().mockResolvedValue(null));

    bundle.manifest.artifact.authenticationTag = '0'.repeat(32);
    await writeFile(bundle.manifestFilePath, JSON.stringify(bundle.manifest));

    try {
      await expect(
        service.importWorkspace({
          manifestFilePath: bundle.manifestFilePath,
          encryptionSecret: ENCRYPTION_SECRET,
        }),
      ).rejects.toThrow('no success may be reported');
      expect(spawn).not.toHaveBeenCalled();
    } finally {
      await rm(bundle.directory, { recursive: true, force: true });
    }
  });

  it('reports a failed single-transaction restore as failure', async () => {
    const bundle = await createBundle();
    const service = createService(jest.fn().mockResolvedValue(null));
    const stderr = new PassThrough();
    const childOnce = jest.fn(
      (eventName: string, listener: (value: number) => void): undefined => {
        if (eventName === 'close') {
          stderr.end(
            'psql:/tmp/private/workspace.sql:44: ERROR:  23503: secret value "do-not-log" violates constraint\nDETAIL: sensitive row\nCONTEXT: COPY account, line 1, column secrets: "do-not-log"\n',
          );
          listener(1);
        }

        return undefined;
      },
    );
    const child = { once: childOnce, stderr };

    jest
      .mocked(spawn)
      .mockReturnValue(child as unknown as ReturnType<typeof spawn>);

    try {
      await expect(
        service.importWorkspace({
          manifestFilePath: bundle.manifestFilePath,
          encryptionSecret: ENCRYPTION_SECRET,
        }),
      ).rejects.toThrow(
        'psql:<sql>:44: ERROR:  23503: secret value <redacted> violates constraint CONTEXT: COPY account, line 1, column secrets: <redacted>',
      );
      expect(spawn).toHaveBeenCalledWith(
        'psql',
        expect.arrayContaining([
          'ON_ERROR_STOP=1',
          'VERBOSITY=verbose',
          '--single-transaction',
        ]),
        expect.objectContaining({ stdio: ['ignore', 'ignore', 'pipe'] }),
      );
    } finally {
      await rm(bundle.directory, { recursive: true, force: true });
    }
  });
});
