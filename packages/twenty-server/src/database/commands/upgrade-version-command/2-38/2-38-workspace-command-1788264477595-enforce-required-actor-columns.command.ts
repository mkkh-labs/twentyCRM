import { Command } from 'nest-commander';
import {
  FieldActorSource,
  FieldMetadataType,
  compositeTypeDefinitions,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { type EntityManager } from 'typeorm';

import { ProvisionedWorkspaceCommandRunner } from 'src/database/commands/command-runners/provisioned-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { computeCompositeColumnName } from 'src/engine/metadata-modules/field-metadata/utils/compute-column-name.util';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { computeObjectTargetTable } from 'src/engine/utils/compute-object-target-table.util';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import {
  escapeIdentifier,
  escapeLiteral,
} from 'src/engine/workspace-manager/workspace-migration/utils/remove-sql-injection.util';
import { generateCompositeColumnDefinition } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/utils/generate-column-definitions.util';

export type RequiredActorColumnTarget = {
  tableName: string;
  columnName: string;
  serializedDefault: string | null;
  repairValue: string;
};

export const buildRequiredActorColumnTargets = ({
  flatObjectMetadataMaps,
  flatFieldMetadataMaps,
  workspaceId,
}: {
  flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
  flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata>;
  workspaceId: string;
}): RequiredActorColumnTarget[] => {
  const actorCompositeType = compositeTypeDefinitions.get(
    FieldMetadataType.ACTOR,
  );

  if (!isDefined(actorCompositeType)) {
    throw new Error('ACTOR composite type definition is unavailable.');
  }

  const targets: RequiredActorColumnTarget[] = [];

  for (const flatFieldMetadata of Object.values(
    flatFieldMetadataMaps.byUniversalIdentifier,
  ).filter(isDefined)) {
    if (
      flatFieldMetadata.type !== FieldMetadataType.ACTOR ||
      flatFieldMetadata.isNullable !== false
    ) {
      continue;
    }

    const flatObjectMetadata =
      flatObjectMetadataMaps.byUniversalIdentifier[
        flatFieldMetadata.objectMetadataUniversalIdentifier
      ];

    if (!isDefined(flatObjectMetadata)) {
      throw new Error(
        `Object metadata is unavailable for required ACTOR field ${flatFieldMetadata.universalIdentifier}.`,
      );
    }

    for (const property of actorCompositeType.properties) {
      if (!property.isRequired) {
        continue;
      }

      const serializedDefault = generateCompositeColumnDefinition({
        compositeProperty: property,
        parentFlatFieldMetadata:
          flatFieldMetadata as FlatFieldMetadata<FieldMetadataType.ACTOR>,
        flatObjectMetadata,
        workspaceId,
      }).default;

      targets.push({
        tableName: computeObjectTargetTable(flatObjectMetadata),
        columnName: computeCompositeColumnName(
          flatFieldMetadata.name,
          property,
        ),
        serializedDefault:
          !isDefined(serializedDefault) || serializedDefault === 'NULL'
            ? null
            : String(serializedDefault),
        repairValue:
          property.name === 'source'
            ? escapeLiteral(FieldActorSource.SYSTEM)
            : escapeLiteral('System'),
      });
    }
  }

  return targets.sort((left, right) =>
    `${left.tableName}.${left.columnName}`.localeCompare(
      `${right.tableName}.${right.columnName}`,
    ),
  );
};

type ColumnState = {
  columnDefault: string | null;
  isNullable: 'YES' | 'NO';
};

@RegisteredWorkspaceCommand('2.38.0', 1788264477595)
@Command({
  name: 'upgrade:2-38:enforce-required-actor-columns',
  description:
    'Backfill required ACTOR composite columns before enforcing metadata nullability',
})
export class EnforceRequiredActorColumnsCommand extends ProvisionedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly workspaceCacheService: WorkspaceCacheService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace({
    workspaceId,
    dataSource,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    if (!isDefined(dataSource)) {
      throw new Error(`Workspace ${workspaceId} has no data source.`);
    }

    const { flatObjectMetadataMaps, flatFieldMetadataMaps } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'flatObjectMetadataMaps',
        'flatFieldMetadataMaps',
      ]);
    const targets = buildRequiredActorColumnTargets({
      flatObjectMetadataMaps,
      flatFieldMetadataMaps,
      workspaceId,
    });
    const schemaName = getWorkspaceSchemaName(workspaceId);

    await dataSource.transaction(async (entityManager) => {
      for (const target of targets) {
        await this.enforceTarget({
          entityManager,
          schemaName,
          target,
          workspaceId,
          isDryRun: options.dryRun ?? false,
        });
      }
    });
  }

  private async enforceTarget({
    entityManager,
    schemaName,
    target,
    workspaceId,
    isDryRun,
  }: {
    entityManager: EntityManager;
    schemaName: string;
    target: RequiredActorColumnTarget;
    workspaceId: string;
    isDryRun: boolean;
  }): Promise<void> {
    const columnStates: ColumnState[] = await entityManager.query(
      `SELECT column_default AS "columnDefault", is_nullable AS "isNullable"
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
      [schemaName, target.tableName, target.columnName],
    );
    const columnState = columnStates[0];

    if (!isDefined(columnState)) {
      throw new Error(
        `Required ACTOR column ${target.tableName}.${target.columnName} is unavailable for workspace ${workspaceId}.`,
      );
    }

    if (columnState.isNullable === 'NO') {
      return;
    }

    const tableIdentifier = `${escapeIdentifier(schemaName)}.${escapeIdentifier(target.tableName)}`;
    const columnIdentifier = escapeIdentifier(target.columnName);
    const nullCountRows: { count: number }[] = await entityManager.query(
      `SELECT COUNT(*)::int AS count FROM ${tableIdentifier} WHERE ${columnIdentifier} IS NULL`,
    );
    const nullCount = nullCountRows[0]?.count ?? 0;

    const repairExpression =
      columnState.columnDefault ??
      target.serializedDefault ??
      target.repairValue;

    if (isDryRun) {
      this.logger.log(
        `[DRY RUN] Would backfill ${nullCount} null row(s) and enforce ${target.tableName}.${target.columnName} for workspace ${workspaceId}`,
      );

      return;
    }

    if (nullCount > 0) {
      await entityManager.query(
        `UPDATE ${tableIdentifier} SET ${columnIdentifier} = ${
          isDefined(columnState.columnDefault) ? 'DEFAULT' : repairExpression
        } WHERE ${columnIdentifier} IS NULL`,
      );
    }

    await entityManager.query(
      `ALTER TABLE ${tableIdentifier} ALTER COLUMN ${columnIdentifier} SET NOT NULL`,
    );
  }
}
