import { randomUUID } from 'node:crypto';

import { gql } from 'graphql-tag';
import request from 'supertest';

import { createOneOperationFactory } from 'test/integration/graphql/utils/create-one-operation-factory.util';
import { generateApiKeyToken } from 'test/integration/graphql/utils/generate-api-key-token.util';
import { makeGraphqlAPIRequest } from 'test/integration/graphql/utils/make-graphql-api-request.util';
import { createOneRole } from 'test/integration/metadata/suites/role/utils/create-one-role.util';
import { deleteOneRole } from 'test/integration/metadata/suites/role/utils/delete-one-role.util';
import { makeMetadataAPIRequest } from 'test/integration/metadata/suites/utils/make-metadata-api-request.util';
import { deleteRecordsByIds } from 'test/integration/utils/delete-records-by-ids';
import { jestExpectToBeDefined } from 'test/utils/jest-expect-to-be-defined.util.test';

type McpToolCallResult = {
  content?: Array<{ type: string; text: string }>;
  isError?: boolean;
};

const postMcp = (body: Record<string, unknown>, bearer: string) =>
  request(`http://localhost:${APP_PORT}`)
    .post('/mcp')
    .set('Authorization', `Bearer ${bearer}`)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .send(JSON.stringify(body));

const callNavigateToRecord = async ({
  bearer,
  objectNameSingular,
  recordName,
}: {
  bearer: string;
  objectNameSingular: string;
  recordName: string;
}) =>
  postMcp(
    {
      jsonrpc: '2.0',
      method: 'tools/call',
      id: `navigate-${randomUUID()}`,
      params: {
        name: 'execute_tool',
        arguments: {
          toolName: 'navigate_app',
          arguments: {
            navigation: {
              type: 'navigateToRecord',
              objectNameSingular,
              recordName,
            },
          },
        },
      },
    },
    bearer,
  ).expect(200);

describe('MCP navigate tool authority (integration)', () => {
  const companyId = randomUUID();
  const companyName = `NavSecret${randomUUID().slice(0, 8)}`;
  const personId = randomUUID();
  const personName = `NavPerson${randomUUID().slice(0, 8)}`;
  let apiKeyId: string | undefined;
  let restrictedRoleId: string | undefined;
  let restrictedApiKeyToken: string;

  beforeAll(async () => {
    const { data: restrictedRoleData } = await createOneRole({
      expectToFail: false,
      input: {
        label: `Navigate Restricted ${randomUUID()}`,
        description: 'API-key role without object-record read permission',
        icon: 'IconKey',
        canUpdateAllSettings: false,
        canAccessAllTools: true,
        canReadAllObjectRecords: false,
        canUpdateAllObjectRecords: false,
        canSoftDeleteAllObjectRecords: false,
        canDestroyAllObjectRecords: false,
        canBeAssignedToUsers: false,
        canBeAssignedToAgents: false,
        canBeAssignedToApiKeys: true,
      },
    });

    restrictedRoleId = restrictedRoleData?.createOneRole?.id as
      | string
      | undefined;
    jestExpectToBeDefined(restrictedRoleId);

    const createApiKeyResponse = await makeMetadataAPIRequest({
      query: gql`
        mutation CreateNavigateRestrictedApiKey($input: CreateApiKeyInput!) {
          createApiKey(input: $input) {
            id
          }
        }
      `,
      variables: {
        input: {
          name: `Navigate restricted key ${randomUUID()}`,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          roleId: restrictedRoleId,
        },
      },
    });

    apiKeyId = createApiKeyResponse.body.data?.createApiKey?.id;
    jestExpectToBeDefined(apiKeyId);

    const tokenResponse = await generateApiKeyToken({
      apiKeyId,
      accessToken: APPLE_JANE_ADMIN_ACCESS_TOKEN,
    });

    restrictedApiKeyToken = tokenResponse.body.data?.generateApiKeyToken?.token;
    jestExpectToBeDefined(restrictedApiKeyToken);

    const createCompanyResponse = await makeGraphqlAPIRequest(
      createOneOperationFactory({
        objectMetadataSingularName: 'company',
        gqlFields: 'id name',
        data: {
          id: companyId,
          name: companyName,
        },
      }),
    );

    expect(createCompanyResponse.body.errors).toBeUndefined();
    expect(createCompanyResponse.body.data?.createCompany?.id).toBe(companyId);

    const createPersonResponse = await makeGraphqlAPIRequest(
      createOneOperationFactory({
        objectMetadataSingularName: 'person',
        gqlFields: 'id name { firstName lastName }',
        data: {
          id: personId,
          name: { firstName: personName, lastName: '' },
        },
      }),
    );

    expect(createPersonResponse.body.errors).toBeUndefined();
    expect(createPersonResponse.body.data?.createPerson?.id).toBe(personId);
  });

  afterAll(async () => {
    await deleteRecordsByIds('company', [companyId]);
    await deleteRecordsByIds('person', [personId]);

    if (apiKeyId) {
      await testDataSource.query('DELETE FROM core."apiKey" WHERE id = $1', [
        apiKeyId,
      ]);
    }

    if (restrictedRoleId) {
      await deleteOneRole({
        expectToFail: false,
        input: { idToDelete: restrictedRoleId },
      });
    }
  });

  it('discovers a record when the caller can read the object', async () => {
    const response = await callNavigateToRecord({
      bearer: API_KEY_ACCESS_TOKEN,
      objectNameSingular: 'company',
      recordName: companyName,
    });
    const result = response.body.result as McpToolCallResult;
    const serializedResponse = JSON.stringify(response.body);

    expect(serializedResponse).toContain(companyId);
    expect(result.isError).toBe(false);
  });

  it('discovers a FULL_NAME record when the caller can read the object', async () => {
    const response = await callNavigateToRecord({
      bearer: API_KEY_ACCESS_TOKEN,
      objectNameSingular: 'person',
      recordName: personName,
    });
    const result = response.body.result as McpToolCallResult;
    const serializedResponse = JSON.stringify(response.body);

    expect(serializedResponse).toContain(personId);
    expect(result.isError).toBe(false);
  });

  it('denies record discovery when the caller cannot read the object', async () => {
    const response = await callNavigateToRecord({
      bearer: restrictedApiKeyToken,
      objectNameSingular: 'company',
      recordName: companyName,
    });
    const result = response.body.result as McpToolCallResult;
    const serializedResponse = JSON.stringify(response.body);

    expect(result.isError).toBe(true);
    expect(serializedResponse).not.toContain(companyId);
  });
});
