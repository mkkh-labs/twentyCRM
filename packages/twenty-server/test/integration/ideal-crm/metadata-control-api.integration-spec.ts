import { gql } from '@apollo/client';

import { deleteOneFieldMetadata } from 'test/integration/metadata/suites/field-metadata/utils/delete-one-field-metadata.util';
import { deleteOneObjectMetadata } from 'test/integration/metadata/suites/object-metadata/utils/delete-one-object-metadata.util';
import { updateOneObjectMetadata } from 'test/integration/metadata/suites/object-metadata/utils/update-one-object-metadata.util';
import { makeMetadataAPIRequest } from 'test/integration/metadata/suites/utils/make-metadata-api-request.util';
import {
  cleanupTestField,
  cleanupTestObject,
  createTestFieldViaGraphql,
  createTestObjectViaGraphql,
} from 'test/integration/rest/utils/metadata-rest-api.util';
import { ErrorCode } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { WorkspaceMigrationV2ExceptionCode } from 'twenty-shared/metadata';

const TEST_WORKSPACE_ID = '20202020-1c25-4d02-bf25-6aeccf7ea419';

const GET_METADATA_CONTROLS = gql`
  query GetIdealCrmMetadataControls {
    metadataChangeSets(limit: 10)
    configurationVersions(limit: 10)
    outboxOperations(limit: 10)
  }
`;

const CREATE_METADATA_CHANGE_SET = gql`
  mutation CreateIdealCrmMetadataChangeSet(
    $input: CreateMetadataChangeSetInput!
  ) {
    createMetadataChangeSet(input: $input)
  }
`;

type MetadataControlResponse = {
  data?: {
    metadataChangeSets?: unknown;
    configurationVersions?: unknown;
    outboxOperations?: unknown;
    createMetadataChangeSet?: unknown;
  };
  errors?: {
    message: string;
    extensions?: { code?: string; subCode?: string };
  }[];
};

describe('Ideal CRM metadata control API', () => {
  it('exposes workspace-bound metadata, configuration, and outbox controls to an authorized admin', async () => {
    const response = await makeMetadataAPIRequest({
      query: GET_METADATA_CONTROLS,
    });
    const body = response.body as MetadataControlResponse;

    expect(response.status).toBe(200);
    expect(body.errors).toBeUndefined();
    expect(body.data).toEqual({
      metadataChangeSets: expect.any(Array),
      configurationVersions: expect.any(Array),
      outboxOperations: expect.any(Array),
    });
  });

  it('denies unauthenticated metadata control reads', async () => {
    const response = await makeMetadataAPIRequest(
      { query: GET_METADATA_CONTROLS },
      null,
    );
    const body = response.body as MetadataControlResponse;

    expect(response.status).toBe(200);
    expect(body.data).toBeNull();
    expect(body.errors).toEqual(expect.any(Array));
  });

  it('rejects a change set created against a stale workspace version', async () => {
    const rows = (await global.testDataSource.query(
      'SELECT "metadataVersion" FROM core."workspace" WHERE "id" = $1',
      [TEST_WORKSPACE_ID],
    )) as { metadataVersion: number }[];
    const metadataVersion = rows[0]?.metadataVersion;

    expect(metadataVersion).toEqual(expect.any(Number));

    const response = await makeMetadataAPIRequest({
      query: CREATE_METADATA_CHANGE_SET,
      variables: {
        input: {
          baseMetadataVersion: metadataVersion + 1,
          applicationUniversalIdentifier:
            'ideal-crm-metadata-api-integration-test',
          migrationPlan: {
            fieldMetadata: {
              flatEntityToCreate: {},
              flatEntityToUpdate: {
                'ideal-crm-test-field': {
                  universalIdentifier: 'ideal-crm-test-field',
                },
              },
              flatEntityToDelete: {},
            },
          },
        },
      },
    });
    const body = response.body as MetadataControlResponse;

    expect(response.status).toBe(200);
    expect(body.data).toBeNull();
    expect(body.errors?.[0]?.message).toContain(
      'Metadata base version is stale.',
    );
  });

  it('returns an explicit conflict when direct GraphQL deletion bypasses a required change set', async () => {
    const { id: objectMetadataId } = await createTestObjectViaGraphql();
    const { id: fieldMetadataId } =
      await createTestFieldViaGraphql(objectMetadataId);

    try {
      const fieldDeletion = await deleteOneFieldMetadata({
        input: { idToDelete: fieldMetadataId },
        expectToFail: true,
      });

      expect(fieldDeletion.errors?.[0]).toMatchObject({
        message: 'Destructive metadata changes require explicit authorization.',
        extensions: {
          code: ErrorCode.CONFLICT,
          subCode: WorkspaceMigrationV2ExceptionCode.CHANGE_SET_REQUIRED,
        },
      });

      await updateOneObjectMetadata({
        input: {
          idToUpdate: objectMetadataId,
          updatePayload: { isActive: false },
        },
        expectToFail: false,
      });

      const objectDeletion = await deleteOneObjectMetadata({
        input: { idToDelete: objectMetadataId },
        expectToFail: true,
      });

      expect(objectDeletion.errors?.[0]).toMatchObject({
        message: 'Destructive metadata changes require explicit authorization.',
        extensions: {
          code: ErrorCode.CONFLICT,
          subCode: WorkspaceMigrationV2ExceptionCode.CHANGE_SET_REQUIRED,
        },
      });
    } finally {
      await cleanupTestField(fieldMetadataId);
      await cleanupTestObject(objectMetadataId);
    }
  });
});
