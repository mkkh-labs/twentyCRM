import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomBytes, randomUUID } from 'crypto';
import { once } from 'events';
import { createWriteStream, mkdirSync } from 'fs';
import { unlink, writeFile } from 'fs/promises';
import { basename } from 'path';
import { type Writable } from 'stream';
import { finished } from 'stream/promises';

import { DataSource, type EntityMetadata, type QueryRunner } from 'typeorm';

import { buildInsertPrefix } from 'src/database/commands/workspace-export/utils/build-insert-prefix.util';
import { buildConflictSafeInsertStatement } from 'src/database/commands/workspace-export/utils/build-conflict-safe-insert-statement.util';
import { buildWorkspaceTableColumnSets } from 'src/database/commands/workspace-export/utils/build-workspace-table-column-sets.util';
import { formatSqlValue } from 'src/database/commands/workspace-export/utils/format-sql-value.util';
import {
  generateWorkspaceSchemaDdl,
  type PhysicalColumnNullabilityByTable,
} from 'src/database/commands/workspace-export/utils/generate-workspace-schema-ddl.util';
import { getCoreEntityMetadatasWithWorkspaceId } from 'src/database/commands/workspace-export/utils/get-core-entity-metadatas-with-workspace-id.util';
import { readWorkspacePostDataDdl } from 'src/database/commands/workspace-export/utils/read-workspace-post-data-ddl.util';
import { computeFileSha256 } from 'src/database/commands/workspace-export/utils/compute-file-sha256.util';
import { type WorkspacePortableExportManifest } from 'src/database/commands/workspace-export/types/workspace-portable-export-manifest.type';
import {
  createWorkspaceExportCipher,
  deriveWorkspaceExportKey,
} from 'src/database/commands/workspace-export/utils/workspace-portable-export-crypto.util';
import { ConfigurationVersionEntity } from 'src/engine/core-modules/configuration-version/entities/configuration-version.entity';
import { TWENTY_CURRENT_VERSION } from 'src/engine/core-modules/upgrade/constants/twenty-current-version.constant';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { SearchFieldMetadataEntity } from 'src/engine/metadata-modules/search-field-metadata/search-field-metadata.entity';
import { computeTableName } from 'src/engine/utils/compute-table-name.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';
import { escapeIdentifier } from 'src/engine/workspace-manager/workspace-migration/utils/remove-sql-injection.util';
import { isNonEmptyArray } from 'twenty-shared/utils';
import { formatPgCopyField } from './utils/format-pg-copy-value.util';

const BATCH_SIZE = 10_000;

type WorkspaceExportParams = {
  workspaceId: string;
  outputPath: string;
  encryptionSecret: string;
  tableFilter?: string[];
};

export type WorkspaceExportResult = {
  encryptedSqlFilePath: string;
  manifestFilePath: string;
  manifest: WorkspacePortableExportManifest;
};

type WriteRowsOptions = {
  schemaName: string;
  tableName: string;
  displayName: string;
  queryRunner: QueryRunner;
  stream: Writable;
  whereClause?: string;
  queryParameters?: unknown[];
  jsonColumns?: Set<string>;
  excludedColumns?: Set<string>;
  conflictKeyColumns?: string[];
  identityColumns?: string[];
};

@Injectable()
export class WorkspaceExportService {
  private readonly logger = new Logger(WorkspaceExportService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async exportWorkspace({
    workspaceId,
    outputPath,
    encryptionSecret,
    tableFilter,
  }: WorkspaceExportParams): Promise<WorkspaceExportResult> {
    const queryRunner = this.dataSource.createQueryRunner();
    let encryptedSqlFilePath: string | undefined;
    let manifestFilePath: string | undefined;

    await queryRunner.connect();

    try {
      await queryRunner.startTransaction('REPEATABLE READ');
      await queryRunner.query('SET TRANSACTION READ ONLY');

      const workspace = await queryRunner.manager
        .getRepository(WorkspaceEntity)
        .findOne({ where: { id: workspaceId } });

      if (!workspace) {
        throw new Error(`Workspace ${workspaceId} not found`);
      }

      const schemaName = getWorkspaceSchemaName(workspaceId);

      this.logger.log(`Exporting workspace ${workspaceId} (${schemaName})`);

      const objectMetadatas = await queryRunner.manager
        .getRepository(ObjectMetadataEntity)
        .find({
          where: { workspaceId },
          relations: { application: true },
        });
      const fieldMetadatas = await queryRunner.manager
        .getRepository(FieldMetadataEntity)
        .find({ where: { workspaceId } });
      const searchFieldMetadatas = await queryRunner.manager
        .getRepository(SearchFieldMetadataEntity)
        .find({ where: { workspaceId } });
      const latestConfigurationVersion = await queryRunner.manager
        .getRepository(ConfigurationVersionEntity)
        .findOne({
          where: { workspaceId },
          order: { createdAt: 'DESC' },
        });

      const fieldsByObjectId = new Map<string, FieldMetadataEntity[]>();

      for (const fieldMetadata of fieldMetadatas) {
        const objectFields =
          fieldsByObjectId.get(fieldMetadata.objectMetadataId) ?? [];

        objectFields.push(fieldMetadata);
        fieldsByObjectId.set(fieldMetadata.objectMetadataId, objectFields);
      }

      const searchFieldMetadatasByObjectId = new Map<
        string,
        SearchFieldMetadataEntity[]
      >();

      for (const searchFieldMetadata of searchFieldMetadatas) {
        const objectSearchFieldMetadatas =
          searchFieldMetadatasByObjectId.get(
            searchFieldMetadata.objectMetadataId,
          ) ?? [];

        objectSearchFieldMetadatas.push(searchFieldMetadata);
        searchFieldMetadatasByObjectId.set(
          searchFieldMetadata.objectMetadataId,
          objectSearchFieldMetadatas,
        );
      }

      const requestedTables = new Set(tableFilter ?? []);
      const availableTables = new Set(
        objectMetadatas.map((objectMetadata) => objectMetadata.nameSingular),
      );
      const unknownTables = [...requestedTables].filter(
        (tableName) => !availableTables.has(tableName),
      );

      if (unknownTables.length > 0) {
        throw new Error(
          `Unknown workspace export table(s): ${unknownTables.sort().join(', ')}`,
        );
      }

      mkdirSync(outputPath, { recursive: true, mode: 0o700 });

      const createdAt = new Date().toISOString();
      const timestamp = createdAt.replace(/[:.]/g, '-');
      const exportId = randomUUID();
      const rootCorrelationId = randomUUID();

      encryptedSqlFilePath = `${outputPath}/${workspaceId}-${timestamp}.sql.enc`;
      manifestFilePath = `${outputPath}/${workspaceId}-${timestamp}.manifest.json`;

      const encryptedFileStream = createWriteStream(encryptedSqlFilePath, {
        flags: 'wx',
        mode: 0o600,
      });
      const salt = randomBytes(16);
      const initializationVector = randomBytes(12);
      const cipher = createWorkspaceExportCipher(
        deriveWorkspaceExportKey(encryptionSecret, salt),
        initializationVector,
      );

      cipher.pipe(encryptedFileStream);

      try {
        cipher.write("SET session_replication_role = 'replica';\n\n");
        await this.writeCoreEntityRows(workspaceId, queryRunner, cipher);
        cipher.write(
          `\nCREATE SCHEMA IF NOT EXISTS ${escapeIdentifier(schemaName)};\n\n`,
        );
        await this.writeWorkspaceSchemaDdl(
          workspaceId,
          schemaName,
          objectMetadatas,
          fieldsByObjectId,
          searchFieldMetadatasByObjectId,
          queryRunner,
          cipher,
        );
        await this.writeWorkspaceDataRows(
          workspaceId,
          schemaName,
          objectMetadatas,
          fieldsByObjectId,
          tableFilter,
          queryRunner,
          cipher,
        );
        await this.writeWorkspacePostDataDdl(
          schemaName,
          objectMetadatas
            .filter(
              (objectMetadata) =>
                objectMetadata.isActive &&
                (!tableFilter ||
                  tableFilter.includes(objectMetadata.nameSingular)),
            )
            .map((objectMetadata) =>
              computeTableName(
                objectMetadata.nameSingular,
                objectMetadata.application?.universalIdentifier !==
                  TWENTY_STANDARD_APPLICATION.universalIdentifier,
              ),
            ),
          queryRunner,
          cipher,
        );
        cipher.write("\nSET session_replication_role = 'origin';\n");
        cipher.end();
        await finished(encryptedFileStream);
      } catch (error) {
        cipher.destroy();
        encryptedFileStream.destroy();
        await Promise.allSettled([finished(encryptedFileStream)]);
        throw error;
      }

      const sha256 = await computeFileSha256(encryptedSqlFilePath);
      const manifest: WorkspacePortableExportManifest = {
        schemaVersion: 1,
        exportId,
        rootCorrelationId,
        platformVersion: TWENTY_CURRENT_VERSION,
        workspaceId,
        workspaceSchemaName: schemaName,
        createdAt,
        configurationVersion: latestConfigurationVersion
          ? {
              id: latestConfigurationVersion.id,
              snapshotDigest: latestConfigurationVersion.snapshotDigest,
            }
          : null,
        scope: tableFilter
          ? { type: 'FILTERED', tables: [...requestedTables].sort() }
          : { type: 'FULL', tables: [] },
        artifact: {
          fileName: basename(encryptedSqlFilePath),
          cipher: 'AES-256-GCM',
          keyDerivation: 'SCRYPT',
          salt: salt.toString('hex'),
          initializationVector: initializationVector.toString('hex'),
          authenticationTag: cipher.getAuthTag().toString('hex'),
          sha256,
          containsSensitiveData: true,
        },
      };

      await writeFile(
        manifestFilePath,
        `${JSON.stringify(manifest, null, 2)}\n`,
        {
          encoding: 'utf8',
          flag: 'wx',
          mode: 0o600,
        },
      );
      await queryRunner.commitTransaction();

      return { encryptedSqlFilePath, manifestFilePath, manifest };
    } catch (error) {
      await Promise.allSettled(
        [encryptedSqlFilePath, manifestFilePath]
          .filter((filePath): filePath is string => filePath !== undefined)
          .map((filePath) => unlink(filePath)),
      );
      throw error;
    } finally {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      await queryRunner.release();
    }
  }

  private async writeCoreEntityRows(
    workspaceId: string,
    queryRunner: QueryRunner,
    stream: Writable,
  ): Promise<void> {
    const workspaceEntityMetadata = this.dataSource.entityMetadatas.find(
      (entityMetadata) => entityMetadata.tableName === 'workspace',
    );

    if (workspaceEntityMetadata) {
      await this.writeRows({
        schemaName: workspaceEntityMetadata.schema || 'core',
        tableName: workspaceEntityMetadata.tableName,
        displayName: workspaceEntityMetadata.tableName,
        queryRunner,
        stream,
        whereClause: '"id" = $1',
        queryParameters: [workspaceId],
        jsonColumns: this.buildJsonColumnSet(workspaceEntityMetadata),
      });
    }

    const coreEntityMetadatas = getCoreEntityMetadatasWithWorkspaceId(
      this.dataSource,
    );

    for (const entityMetadata of coreEntityMetadatas) {
      await this.writeRows({
        schemaName: entityMetadata.schema || 'core',
        tableName: entityMetadata.tableName,
        displayName: entityMetadata.tableName,
        queryRunner,
        stream,
        whereClause: '"workspaceId" = $1',
        queryParameters: [workspaceId],
        jsonColumns: this.buildJsonColumnSet(entityMetadata),
      });
    }

    const userEntityMetadata = this.dataSource.entityMetadatas.find(
      (entityMetadata) => entityMetadata.tableName === 'user',
    );

    if (userEntityMetadata) {
      await this.writeRows({
        schemaName: userEntityMetadata.schema || 'core',
        tableName: userEntityMetadata.tableName,
        displayName: userEntityMetadata.tableName,
        queryRunner,
        stream,
        whereClause:
          '"id" IN (SELECT "userId" FROM "core"."userWorkspace" WHERE "workspaceId" = $1)',
        queryParameters: [workspaceId],
        jsonColumns: this.buildJsonColumnSet(userEntityMetadata),
        conflictKeyColumns: ['id'],
        identityColumns: ['email'],
      });
    }
  }

  private buildJsonColumnSet(entityMetadata: EntityMetadata): Set<string> {
    return new Set(
      entityMetadata.columns
        .filter((column) => column.type === 'jsonb' || column.type === 'json')
        .map((column) => column.databaseName),
    );
  }

  private async writeRows({
    schemaName,
    tableName,
    displayName,
    queryRunner,
    stream,
    whereClause,
    queryParameters = [],
    jsonColumns,
    excludedColumns,
    conflictKeyColumns,
    identityColumns,
  }: WriteRowsOptions): Promise<void> {
    const whereFragment = whereClause ? ` WHERE ${whereClause}` : '';
    let columnNames: string[] | undefined;
    let insertPrefix: string | undefined;
    let totalRows = 0;

    for (let offset = 0; ; offset += BATCH_SIZE) {
      const rows: Record<string, unknown>[] = await queryRunner.query(
        `SELECT * FROM ${escapeIdentifier(schemaName)}.${escapeIdentifier(tableName)}${whereFragment} ORDER BY "id" LIMIT ${BATCH_SIZE} OFFSET ${offset}`,
        queryParameters,
      );

      if (!isNonEmptyArray(rows)) break;

      if (!columnNames) {
        columnNames = Object.keys(rows[0]).filter(
          (columnName) => !excludedColumns?.has(columnName),
        );
        insertPrefix = buildInsertPrefix(schemaName, tableName, columnNames);
      }

      const currentColumnNames = columnNames;
      const currentInsertPrefix = insertPrefix;

      totalRows += rows.length;

      const statement =
        conflictKeyColumns && identityColumns
          ? buildConflictSafeInsertStatement({
              schemaName,
              tableName,
              columnNames: currentColumnNames,
              rows,
              conflictKeyColumns,
              identityColumns,
              jsonColumns,
            })
          : `${currentInsertPrefix}${rows
              .map((row) => {
                const formattedValues = currentColumnNames.map((columnName) =>
                  formatSqlValue(row[columnName], jsonColumns?.has(columnName)),
                );

                return `(${formattedValues.join(', ')})`;
              })
              .join(', ')};\n`;

      if (!stream.write(statement)) {
        await once(stream, 'drain');
      }

      if (rows.length < BATCH_SIZE) break;
    }

    if (totalRows > 0) {
      this.logger.log(`  ${displayName}: ${totalRows} rows`);
    }
  }

  private async writeCopyRows({
    schemaName,
    tableName,
    displayName,
    queryRunner,
    stream,
    jsonColumns,
    excludedColumns,
  }: Omit<WriteRowsOptions, 'whereClause' | 'queryParameters'>): Promise<void> {
    let columnNames: string[] | undefined;
    let totalRows = 0;

    for (let offset = 0; ; offset += BATCH_SIZE) {
      const rows: Record<string, unknown>[] = await queryRunner.query(
        `SELECT * FROM ${escapeIdentifier(schemaName)}.${escapeIdentifier(tableName)} ORDER BY "id" LIMIT ${BATCH_SIZE} OFFSET ${offset}`,
      );

      if (!isNonEmptyArray(rows)) break;

      if (!columnNames) {
        columnNames = Object.keys(rows[0]).filter(
          (columnName) => !excludedColumns?.has(columnName),
        );

        const escapedColumns = columnNames.map(escapeIdentifier).join(', ');

        stream.write(
          `COPY ${escapeIdentifier(schemaName)}.${escapeIdentifier(tableName)} (${escapedColumns}) FROM stdin;\n`,
        );
      }

      totalRows += rows.length;

      for (const row of rows) {
        const values = columnNames.map((columnName) =>
          formatPgCopyField(row[columnName], jsonColumns?.has(columnName)),
        );

        if (!stream.write(values.join('\t') + '\n')) {
          await once(stream, 'drain');
        }
      }

      if (rows.length < BATCH_SIZE) break;
    }

    if (isNonEmptyArray(columnNames)) {
      stream.write('\\.\n\n');
    }

    if (totalRows > 0) {
      this.logger.log(`  ${displayName}: ${totalRows} rows`);
    }
  }

  private async writeWorkspaceSchemaDdl(
    workspaceId: string,
    schemaName: string,
    objectMetadatas: ObjectMetadataEntity[],
    fieldsByObjectId: Map<string, FieldMetadataEntity[]>,
    searchFieldMetadatasByObjectId: Map<string, SearchFieldMetadataEntity[]>,
    queryRunner: QueryRunner,
    stream: Writable,
  ): Promise<void> {
    this.logger.log('Generating workspace schema DDL from metadata...');

    const physicalColumnNullabilityByTable =
      await this.readPhysicalColumnNullabilityByTable({
        schemaName,
        objectMetadatas,
        queryRunner,
      });

    const ddlStatements = generateWorkspaceSchemaDdl(
      workspaceId,
      schemaName,
      objectMetadatas,
      fieldsByObjectId,
      searchFieldMetadatasByObjectId,
      physicalColumnNullabilityByTable,
    );

    this.logger.log(`  ${ddlStatements.length} DDL statements`);

    for (const statement of ddlStatements) {
      stream.write(statement + '\n');
    }

    stream.write('\n');
  }

  private async readPhysicalColumnNullabilityByTable({
    schemaName,
    objectMetadatas,
    queryRunner,
  }: {
    schemaName: string;
    objectMetadatas: ObjectMetadataEntity[];
    queryRunner: QueryRunner;
  }): Promise<PhysicalColumnNullabilityByTable> {
    const tableNames = objectMetadatas
      .filter((objectMetadata) => objectMetadata.isActive)
      .map((objectMetadata) =>
        computeTableName(
          objectMetadata.nameSingular,
          objectMetadata.application?.universalIdentifier !==
            TWENTY_STANDARD_APPLICATION.universalIdentifier,
        ),
      );

    if (tableNames.length === 0) {
      return new Map();
    }

    const columnRows: {
      tableName: string;
      columnName: string;
      isNullable: boolean;
    }[] = await queryRunner.query(
      `SELECT
        table_name AS "tableName",
        column_name AS "columnName",
        is_nullable = 'YES' AS "isNullable"
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = ANY($2::text[])
      ORDER BY table_name, ordinal_position`,
      [schemaName, tableNames],
    );
    const nullabilityByTable = new Map<string, Map<string, boolean>>();

    for (const columnRow of columnRows) {
      const tableNullability =
        nullabilityByTable.get(columnRow.tableName) ?? new Map();

      tableNullability.set(columnRow.columnName, columnRow.isNullable);
      nullabilityByTable.set(columnRow.tableName, tableNullability);
    }

    return nullabilityByTable;
  }

  private async writeWorkspaceDataRows(
    workspaceId: string,
    schemaName: string,
    objectMetadatas: ObjectMetadataEntity[],
    fieldsByObjectId: Map<string, FieldMetadataEntity[]>,
    tableFilter: string[] | undefined,
    queryRunner: QueryRunner,
    stream: Writable,
  ): Promise<void> {
    for (const objectMetadata of objectMetadatas) {
      if (!objectMetadata.isActive) continue;

      const tableName = computeTableName(
        objectMetadata.nameSingular,
        objectMetadata.application?.universalIdentifier !==
          TWENTY_STANDARD_APPLICATION.universalIdentifier,
      );

      if (tableFilter && !tableFilter.includes(objectMetadata.nameSingular)) {
        continue;
      }

      const objectFieldMetadatas =
        fieldsByObjectId.get(objectMetadata.id) ?? [];

      const { jsonColumns, generatedColumns } = buildWorkspaceTableColumnSets(
        workspaceId,
        objectMetadata,
        objectFieldMetadatas,
      );

      await this.writeCopyRows({
        schemaName,
        tableName,
        displayName: objectMetadata.nameSingular,
        queryRunner,
        stream,
        jsonColumns,
        excludedColumns: generatedColumns,
      });
    }
  }

  private async writeWorkspacePostDataDdl(
    schemaName: string,
    tableNames: string[],
    queryRunner: QueryRunner,
    stream: Writable,
  ): Promise<void> {
    const ddlStatements = await readWorkspacePostDataDdl({
      queryRunner,
      schemaName,
      tableNames,
    });

    this.logger.log(
      `  ${ddlStatements.length} post-data constraint and index statements`,
    );

    for (const statement of ddlStatements) {
      stream.write(statement + '\n');
    }

    stream.write('\n');
  }
}
