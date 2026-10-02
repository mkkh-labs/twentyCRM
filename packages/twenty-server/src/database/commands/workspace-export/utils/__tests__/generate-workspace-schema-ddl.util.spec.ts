import { FieldMetadataType } from 'twenty-shared/types';

import { type FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { getFlatFieldMetadataMock } from 'src/engine/metadata-modules/flat-field-metadata/__mocks__/get-flat-field-metadata.mock';
import { getFlatObjectMetadataMock } from 'src/engine/metadata-modules/flat-object-metadata/__mocks__/get-flat-object-metadata.mock';
import { type ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { type SearchFieldMetadataEntity } from 'src/engine/metadata-modules/search-field-metadata/search-field-metadata.entity';
import { generateWorkspaceSchemaDdl } from 'src/database/commands/workspace-export/utils/generate-workspace-schema-ddl.util';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

describe('generateWorkspaceSchemaDdl', () => {
  const workspaceId = '20202020-1c25-4d02-bf25-6aeccf7ea419';
  const objectMetadataId = '20202020-object-id';
  const nameFieldId = '20202020-name-field-id';
  const searchVectorFieldId = '20202020-search-vector-field-id';

  const objectMetadata = {
    ...getFlatObjectMetadataMock({
      universalIdentifier: 'person',
      id: objectMetadataId,
      nameSingular: 'person',
      namePlural: 'persons',
    }),
    isActive: true,
  } as unknown as ObjectMetadataEntity;

  const nameField = getFlatFieldMetadataMock({
    universalIdentifier: 'name',
    id: nameFieldId,
    objectMetadataId,
    type: FieldMetadataType.TEXT,
    name: 'name',
  }) as unknown as FieldMetadataEntity;

  const searchVectorField = getFlatFieldMetadataMock({
    universalIdentifier: 'searchVector',
    id: searchVectorFieldId,
    objectMetadataId,
    type: FieldMetadataType.TS_VECTOR,
    name: 'searchVector',
  }) as unknown as FieldMetadataEntity;

  const fieldsByObjectId = new Map<string, FieldMetadataEntity[]>([
    [objectMetadataId, [nameField, searchVectorField]],
  ]);

  const buildSearchFieldMetadata = (
    overrides: Partial<SearchFieldMetadataEntity> = {},
  ): SearchFieldMetadataEntity =>
    ({
      universalIdentifier: 'search-name',
      objectMetadataId,
      fieldMetadataId: nameFieldId,
      tsVectorFieldMetadataId: searchVectorFieldId,
      position: 0,
      ...overrides,
    }) as SearchFieldMetadataEntity;

  const generateSearchVectorColumnSql = (
    searchFieldMetadatasByObjectId: Map<string, SearchFieldMetadataEntity[]>,
  ): string => {
    const statements = generateWorkspaceSchemaDdl(
      workspaceId,
      'workspace_schema',
      [objectMetadata],
      fieldsByObjectId,
      searchFieldMetadatasByObjectId,
    );

    const createTableStatement = statements.find((statement) =>
      statement.includes('"searchVector"'),
    );

    expect(createTableStatement).toBeDefined();

    return createTableStatement as string;
  };

  it('should emit the searchVector column as a STORED generated column derived from searchFieldMetadata', () => {
    const createTableStatement = generateSearchVectorColumnSql(
      new Map([[objectMetadataId, [buildSearchFieldMetadata()]]]),
    );

    expect(createTableStatement).toContain(
      `"searchVector" tsvector GENERATED ALWAYS AS (to_tsvector('simple', COALESCE(public.unaccent_immutable("name"), ''))) STORED`,
    );
  });

  it('should tolerate a legacy NULL tsVectorFieldMetadataId row (pre-2.18 backfill)', () => {
    const createTableStatement = generateSearchVectorColumnSql(
      new Map([
        [
          objectMetadataId,
          [
            buildSearchFieldMetadata({
              tsVectorFieldMetadataId: null as never,
            }),
          ],
        ],
      ]),
    );

    expect(createTableStatement).toContain(
      `GENERATED ALWAYS AS (to_tsvector('simple', COALESCE(public.unaccent_immutable("name"), ''))) STORED`,
    );
  });

  it('should still emit a valid STORED generated column when no searchFieldMetadata rows exist', () => {
    const createTableStatement = generateSearchVectorColumnSql(new Map());

    expect(createTableStatement).toContain(
      `"searchVector" tsvector GENERATED ALWAYS AS (to_tsvector('simple', NULL)) STORED`,
    );
  });

  it('should preserve standard application table and enum names from entity-shaped metadata', () => {
    const workspaceSchemaName = getWorkspaceSchemaName(workspaceId);
    const statusField = getFlatFieldMetadataMock({
      universalIdentifier: 'status',
      id: '20202020-status-field-id',
      objectMetadataId,
      type: FieldMetadataType.SELECT,
      name: 'status',
      options: [
        {
          id: '20202020-status-option-id',
          value: 'ACTIVE',
          label: 'Active',
          color: 'green',
          position: 0,
        },
      ],
      defaultValue: "'ACTIVE'",
    }) as unknown as FieldMetadataEntity;
    const entityShapedObjectMetadata = {
      ...objectMetadata,
      applicationUniversalIdentifier: undefined,
      application: {
        universalIdentifier: TWENTY_STANDARD_APPLICATION.universalIdentifier,
      },
    } as unknown as ObjectMetadataEntity;

    const statements = generateWorkspaceSchemaDdl(
      workspaceId,
      workspaceSchemaName,
      [entityShapedObjectMetadata],
      new Map([[objectMetadataId, [statusField]]]),
      new Map(),
    );

    expect(statements).toContain(
      `CREATE TYPE "${workspaceSchemaName}"."person_status_enum" AS ENUM ('ACTIVE');`,
    );
    expect(statements.join('\n')).toContain(
      `"status" "${workspaceSchemaName}"."person_status_enum"`,
    );
    expect(statements.join('\n')).not.toContain('"_person_status_enum"');
  });

  it('should preserve physical nullability when metadata is stricter than a portable source schema', () => {
    const workspaceSchemaName = getWorkspaceSchemaName(workspaceId);
    const actorField = getFlatFieldMetadataMock({
      universalIdentifier: 'createdBy',
      id: '20202020-created-by-field-id',
      objectMetadataId,
      type: FieldMetadataType.ACTOR,
      name: 'createdBy',
      isNullable: false,
      defaultValue: {
        source: "'MANUAL'",
        workspaceMemberId: null,
        name: "''",
      },
    }) as unknown as FieldMetadataEntity;

    const statements = generateWorkspaceSchemaDdl(
      workspaceId,
      workspaceSchemaName,
      [objectMetadata],
      new Map([[objectMetadataId, [actorField]]]),
      new Map(),
      new Map([
        [
          '_person',
          new Map([
            ['createdBySource', false],
            ['createdByWorkspaceMemberId', true],
            ['createdByName', true],
            ['createdByContext', true],
          ]),
        ],
      ]),
    );
    const createTableStatement = statements.find((statement) =>
      statement.startsWith('CREATE TABLE'),
    );

    expect(createTableStatement).toContain(
      `"createdBySource" "${workspaceSchemaName}"."_person_createdBySource_enum" NOT NULL`,
    );
    expect(createTableStatement).toContain('"createdByName" text DEFAULT NULL');
    expect(createTableStatement).not.toContain(
      '"createdByName" text NOT NULL DEFAULT NULL',
    );
  });
});
