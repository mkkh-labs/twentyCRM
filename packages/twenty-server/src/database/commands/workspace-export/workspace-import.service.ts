import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createDecipheriv } from 'crypto';
import { spawn } from 'child_process';
import { createReadStream, createWriteStream } from 'fs';
import { appendFile, chmod, mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { pipeline } from 'stream/promises';
import { DataSource } from 'typeorm';

import { type WorkspacePortableExportManifest } from 'src/database/commands/workspace-export/types/workspace-portable-export-manifest.type';
import { buildWorkspaceImportVerificationSql } from 'src/database/commands/workspace-export/utils/build-workspace-import-verification-sql.util';
import { computeFileSha256 } from 'src/database/commands/workspace-export/utils/compute-file-sha256.util';
import { deriveWorkspaceExportKey } from 'src/database/commands/workspace-export/utils/workspace-portable-export-crypto.util';
import { validateWorkspacePortableExportManifest } from 'src/database/commands/workspace-export/utils/validate-workspace-portable-export-manifest.util';
import { ConfigurationVersionEntity } from 'src/engine/core-modules/configuration-version/entities/configuration-version.entity';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { TWENTY_CURRENT_VERSION } from 'src/engine/core-modules/upgrade/constants/twenty-current-version.constant';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';

type WorkspaceImportParams = {
  manifestFilePath: string;
  encryptionSecret: string;
};

const MAX_PSQL_DIAGNOSTIC_BYTES = 4096;

const sanitizePsqlDiagnostic = (diagnostic: string): string => {
  const diagnosticLines = diagnostic.split(/\r?\n/u);
  const errorLine = diagnosticLines.find((line) =>
    /(?:ERROR|FATAL):/u.test(line),
  );

  if (!errorLine) {
    return 'no structured database diagnostic was emitted';
  }

  const contextLines = diagnosticLines.filter((line) => /CONTEXT:/u.test(line));

  return [errorLine, ...contextLines]
    .filter((line): line is string => line !== undefined)
    .join(' ')
    .replace(/psql:[^:]+:/u, 'psql:<sql>:')
    .replace(/"[^"]*"|'[^']*'/gu, '<redacted>')
    .slice(0, 2048);
};

@Injectable()
export class WorkspaceImportService {
  private readonly logger = new Logger(WorkspaceImportService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly twentyConfigService: TwentyConfigService,
  ) {}

  async importWorkspace({
    manifestFilePath,
    encryptionSecret,
  }: WorkspaceImportParams): Promise<WorkspacePortableExportManifest> {
    const manifest = validateWorkspacePortableExportManifest(
      JSON.parse(await readFile(manifestFilePath, 'utf8')),
      TWENTY_CURRENT_VERSION,
    );
    const artifactFilePath = join(
      dirname(manifestFilePath),
      manifest.artifact.fileName,
    );
    const artifactSha256 = await computeFileSha256(artifactFilePath);

    if (artifactSha256 !== manifest.artifact.sha256) {
      throw new Error('Workspace export artifact digest verification failed.');
    }

    const existingWorkspace = await this.dataSource
      .getRepository(WorkspaceEntity)
      .findOne({ where: { id: manifest.workspaceId } });

    if (existingWorkspace) {
      throw new Error(
        `Workspace ${manifest.workspaceId} already exists; import is fail-if-exists.`,
      );
    }

    const temporaryDirectory = await mkdtemp(
      join(tmpdir(), 'twenty-workspace-import-'),
    );
    const plaintextSqlFilePath = join(temporaryDirectory, 'workspace.sql');

    await chmod(temporaryDirectory, 0o700);

    try {
      const key = deriveWorkspaceExportKey(
        encryptionSecret,
        Buffer.from(manifest.artifact.salt, 'hex'),
      );
      const decipher = createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(manifest.artifact.initializationVector, 'hex'),
      );

      decipher.setAuthTag(
        Buffer.from(manifest.artifact.authenticationTag, 'hex'),
      );

      await pipeline(
        createReadStream(artifactFilePath),
        decipher,
        createWriteStream(plaintextSqlFilePath, {
          flags: 'wx',
          mode: 0o600,
        }),
      );

      await appendFile(
        plaintextSqlFilePath,
        buildWorkspaceImportVerificationSql(manifest),
        { encoding: 'utf8', mode: 0o600 },
      );

      await this.runPsqlRestore(plaintextSqlFilePath);
      await this.assertRestoredVersionBoundary(manifest);

      this.logger.log(
        `Workspace import complete: workspaceId=${manifest.workspaceId} exportId=${manifest.exportId} correlationId=${manifest.rootCorrelationId}`,
      );

      return manifest;
    } catch (error) {
      const importError = new Error(
        `Workspace import failed for export ${manifest.exportId}; no success may be reported.${
          error instanceof Error && error.message.startsWith('psql exited')
            ? ` ${error.message}`
            : ''
        }`,
      );

      (importError as Error & { cause: unknown }).cause = error;

      throw importError;
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }

  private async runPsqlRestore(sqlFilePath: string): Promise<void> {
    const databaseUrl = this.twentyConfigService.get('PG_DATABASE_URL');

    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        'psql',
        [
          '--no-psqlrc',
          '--quiet',
          '--set',
          'ON_ERROR_STOP=1',
          '--set',
          'VERBOSITY=verbose',
          '--single-transaction',
          '--file',
          sqlFilePath,
        ],
        {
          env: { ...process.env, PGDATABASE: databaseUrl },
          stdio: ['ignore', 'ignore', 'pipe'],
        },
      );

      let diagnostic = '';

      child.stderr?.setEncoding('utf8');
      child.stderr?.on('data', (chunk: string) => {
        if (diagnostic.length >= MAX_PSQL_DIAGNOSTIC_BYTES) {
          return;
        }

        diagnostic += chunk.slice(
          0,
          MAX_PSQL_DIAGNOSTIC_BYTES - diagnostic.length,
        );
      });

      child.once('error', (error) => reject(error));
      child.once('close', (exitCode) => {
        if (exitCode === 0) {
          resolve();
          return;
        }

        reject(
          new Error(
            `psql exited with code ${exitCode ?? 'unknown'}: ${sanitizePsqlDiagnostic(diagnostic)}.`,
          ),
        );
      });
    });
  }

  private async assertRestoredVersionBoundary(
    manifest: WorkspacePortableExportManifest,
  ): Promise<void> {
    const workspace = await this.dataSource
      .getRepository(WorkspaceEntity)
      .findOne({ where: { id: manifest.workspaceId } });

    if (!workspace) {
      throw new Error('Restored workspace verification failed.');
    }

    if (manifest.configurationVersion === null) {
      return;
    }

    const configurationVersion = await this.dataSource
      .getRepository(ConfigurationVersionEntity)
      .findOne({
        where: {
          id: manifest.configurationVersion.id,
          workspaceId: manifest.workspaceId,
          snapshotDigest: manifest.configurationVersion.snapshotDigest,
        },
      });

    if (!configurationVersion) {
      throw new Error('Restored configuration version verification failed.');
    }
  }
}
