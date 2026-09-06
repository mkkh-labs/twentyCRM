import { FieldMetadataType } from 'twenty-shared/types';
import { type DataSource, type EntityManager } from 'typeorm';

import { type WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import {
  buildRequiredActorColumnTargets,
  EnforceRequiredActorColumnsCommand,
} from 'src/database/commands/upgrade-version-command/2-38/2-38-workspace-command-1788264477595-enforce-required-actor-columns.command';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

const WORKSPACE_ID = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const OBJECT_UNIVERSAL_IDENTIFIER = '20202020-object';
const FIELD_UNIVERSAL_IDENTIFIER = '20202020-created-by';

const flatObjectMetadataMaps = {
  byUniversalIdentifier: {
    [OBJECT_UNIVERSAL_IDENTIFIER]: {
      nameSingular: 'rocket',
      applicationUniversalIdentifier: 'custom-application',
    },
  },
} as unknown as FlatEntityMaps<FlatObjectMetadata>;

const buildFlatFieldMetadataMaps = (isNullable: boolean) =>
  ({
    byUniversalIdentifier: {
      [FIELD_UNIVERSAL_IDENTIFIER]: {
        universalIdentifier: FIELD_UNIVERSAL_IDENTIFIER,
        objectMetadataUniversalIdentifier: OBJECT_UNIVERSAL_IDENTIFIER,
        name: 'createdBy',
        type: FieldMetadataType.ACTOR,
        isNullable,
      },
    },
  }) as unknown as FlatEntityMaps<FlatFieldMetadata>;

describe('buildRequiredActorColumnTargets', () => {
  it('returns only required properties for a non-null ACTOR field', () => {
    expect(
      buildRequiredActorColumnTargets({
        flatObjectMetadataMaps,
        flatFieldMetadataMaps: buildFlatFieldMetadataMaps(false),
        workspaceId: WORKSPACE_ID,
      }),
    ).toEqual([
      {
        tableName: '_rocket',
        columnName: 'createdByName',
        serializedDefault: null,
        repairValue: "'System'",
      },
      {
        tableName: '_rocket',
        columnName: 'createdBySource',
        serializedDefault: null,
        repairValue: "'SYSTEM'",
      },
    ]);
  });

  it('does not tighten nullable ACTOR fields', () => {
    expect(
      buildRequiredActorColumnTargets({
        flatObjectMetadataMaps,
        flatFieldMetadataMaps: buildFlatFieldMetadataMaps(true),
        workspaceId: WORKSPACE_ID,
      }),
    ).toEqual([]);
  });
});

describe('EnforceRequiredActorColumnsCommand', () => {
  const buildCommand = ({
    query,
    dryRun = false,
  }: {
    query: jest.Mock;
    dryRun?: boolean;
  }) => {
    const entityManager = { query } as unknown as EntityManager;
    const dataSource = {
      transaction: jest.fn(async (callback) => callback(entityManager)),
    } as unknown as DataSource;
    const workspaceCacheService = {
      getOrRecompute: jest.fn().mockResolvedValue({
        flatObjectMetadataMaps,
        flatFieldMetadataMaps: buildFlatFieldMetadataMaps(false),
      }),
    } as unknown as WorkspaceCacheService;
    const command = new EnforceRequiredActorColumnsCommand(
      {} as WorkspaceIteratorService,
      workspaceCacheService,
    );

    return command
      .runOnWorkspace({
        workspaceId: WORKSPACE_ID,
        dataSource,
        options: { dryRun },
        index: 0,
        total: 1,
      })
      .then(() => ({ dataSource }));
  };

  it('backfills defaults before enforcing not-null constraints', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        { columnDefault: "''::text", isNullable: 'YES' },
      ])
      .mockResolvedValueOnce([{ count: 3 }])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([
        { columnDefault: "'MANUAL'::text", isNullable: 'NO' },
      ]);

    await buildCommand({ query });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('SET "createdByName" = DEFAULT'),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'ALTER COLUMN "createdByName" SET NOT NULL',
      ),
    );
  });

  it('uses an explicit system repair value when a legacy column has no database default', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ columnDefault: null, isNullable: 'YES' }])
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([
        { columnDefault: "'MANUAL'::text", isNullable: 'NO' },
      ]);

    await buildCommand({ query });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(`SET "createdByName" = 'System'`),
    );
  });

  it('does not mutate during dry-run', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        { columnDefault: "''::text", isNullable: 'YES' },
      ])
      .mockResolvedValueOnce([{ count: 3 }])
      .mockResolvedValueOnce([
        { columnDefault: "'MANUAL'::text", isNullable: 'NO' },
      ]);

    await buildCommand({ query, dryRun: true });

    expect(query).toHaveBeenCalledTimes(3);
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE'),
    );
  });
});
