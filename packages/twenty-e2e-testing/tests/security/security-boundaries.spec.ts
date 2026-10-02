import { randomUUID } from 'crypto';
import { type APIRequestContext } from '@playwright/test';
import { expect, test } from '../../lib/fixtures/screenshot';
import { backendGraphQLUrl, frontendOrigin } from '../../lib/requests/backend';
import { postBackendGraphQL } from '../../lib/requests/post-backend-graphql';

const CREATE_PERSON_MUTATION = `
  mutation SecurityCreatePerson($data: PersonCreateInput!) {
    createPerson(data: $data) {
      id
    }
  }
`;

const FIND_PERSON_QUERY = `
  query SecurityFindPerson($id: UUID!) {
    person(filter: { id: { eq: $id } }) {
      id
    }
  }
`;

const CURRENT_WORKSPACE_QUERY = `
  query SecurityCurrentWorkspace {
    currentWorkspace {
      id
      displayName
      metadataVersion
    }
  }
`;

const GET_LOGIN_TOKEN_MUTATION = `
  mutation SecurityGetLoginToken(
    $email: String!
    $password: String!
    $origin: String!
  ) {
    getLoginTokenFromCredentials(
      email: $email
      password: $password
      origin: $origin
    ) {
      loginToken {
        token
      }
    }
  }
`;

const GET_AUTH_TOKENS_MUTATION = `
  mutation SecurityGetAuthTokens($loginToken: String!, $origin: String!) {
    getAuthTokensFromLoginToken(loginToken: $loginToken, origin: $origin) {
      tokens {
        accessOrWorkspaceAgnosticToken {
          token
        }
      }
    }
  }
`;

const IDEAL_CRM_CONTROL_QUERY = `
  query SecurityIdealCrmControls {
    metadataChangeSets(limit: 5)
    configurationVersions(limit: 5)
    outboxOperations(limit: 5)
    policyAuditEvents(limit: 5)
    workflowOperations(limit: 5)
  }
`;

const CREATE_METADATA_CHANGE_SET_MUTATION = `
  mutation SecurityCreateMetadataChangeSet(
    $input: CreateMetadataChangeSetInput!
  ) {
    createMetadataChangeSet(input: $input)
  }
`;

const getWorkspaceBoundBackendGraphQLUrl = ({
  pageUrl,
  hostname,
}: {
  pageUrl: string;
  hostname?: string;
}) => {
  const url = new URL(backendGraphQLUrl);

  url.hostname = hostname ?? new URL(pageUrl).hostname;

  return url.toString();
};

const getWorkspaceBoundBackendMetadataGraphQLUrl = ({
  pageUrl,
  hostname,
}: {
  pageUrl: string;
  hostname?: string;
}) => {
  const url = new URL('/metadata', backendGraphQLUrl);

  url.hostname = hostname ?? new URL(pageUrl).hostname;

  return url.toString();
};

const postBackendMetadataGraphQL = ({
  page,
  data,
}: {
  page: Parameters<typeof postBackendGraphQL>[0]['page'];
  data: Record<string, unknown>;
}) =>
  page.request.post(
    getWorkspaceBoundBackendMetadataGraphQLUrl({ pageUrl: page.url() }),
    {
      headers: { Origin: frontendOrigin },
      data,
    },
  );

const getAppleOnlyAccessToken = async ({
  request,
}: {
  request: APIRequestContext;
}) => {
  const appleWorkspaceOrigin = 'http://apple.localhost:3001';
  const metadataUrl = getWorkspaceBoundBackendMetadataGraphQLUrl({
    pageUrl: appleWorkspaceOrigin,
  });
  const loginResponse = await request.post(metadataUrl, {
    headers: { Origin: frontendOrigin },
    data: {
      operationName: 'SecurityGetLoginToken',
      query: GET_LOGIN_TOKEN_MUTATION,
      variables: {
        email: 'scott.forstall@apple.dev',
        password: 'tim@apple.dev',
        origin: appleWorkspaceOrigin,
      },
    },
  });
  const loginBody = await loginResponse.json();
  const loginToken =
    loginBody.data?.getLoginTokenFromCredentials?.loginToken?.token;

  expect(loginResponse.ok()).toBe(true);
  expect(loginBody.errors).toBeUndefined();
  expect(loginToken).toEqual(expect.any(String));

  const tokenResponse = await request.post(metadataUrl, {
    headers: { Origin: frontendOrigin },
    data: {
      operationName: 'SecurityGetAuthTokens',
      query: GET_AUTH_TOKENS_MUTATION,
      variables: { loginToken, origin: appleWorkspaceOrigin },
    },
  });
  const tokenBody = await tokenResponse.json();
  const accessToken =
    tokenBody.data?.getAuthTokensFromLoginToken?.tokens
      ?.accessOrWorkspaceAgnosticToken?.token;

  expect(tokenResponse.ok()).toBe(true);
  expect(tokenBody.errors).toBeUndefined();
  expect(accessToken).toEqual(expect.any(String));

  return accessToken as string;
};

const expectPersonNotCreated = async ({
  page,
  personId,
}: {
  page: Parameters<typeof postBackendGraphQL>[0]['page'];
  personId: string;
}) => {
  const verificationResponse = await postBackendGraphQL({
    page,
    data: {
      operationName: 'SecurityFindPerson',
      query: FIND_PERSON_QUERY,
      variables: { id: personId },
    },
  });
  const verificationBody = await verificationResponse.json();

  expect(verificationResponse.ok()).toBe(true);
  expect(verificationBody.data?.person).toBeNull();
  expect(verificationBody.errors).toEqual([
    expect.objectContaining({
      extensions: expect.objectContaining({ subCode: 'RECORD_NOT_FOUND' }),
    }),
  ]);
};

test.describe('Security boundaries', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/objects/people');
    await expect(page.getByText('All People', { exact: false })).toBeVisible();
  });

  test('rejects a session-cookie mutation without an Origin before creating a record', async ({
    page,
  }) => {
    const personId = randomUUID();
    const response = await page.request.post(
      getWorkspaceBoundBackendGraphQLUrl({ pageUrl: page.url() }),
      {
        data: {
          operationName: 'SecurityCreatePerson',
          query: CREATE_PERSON_MUTATION,
          variables: {
            data: {
              id: personId,
              name: { firstName: 'CSRF', lastName: 'MissingOrigin' },
            },
          },
        },
      },
    );
    const body = await response.json();

    expect(response.status()).toBe(403);
    expect(body).toMatchObject({ error: 'CSRF_ORIGIN_MISMATCH' });
    await expectPersonNotCreated({ page, personId });
  });

  test('rejects a sibling-workspace Origin before creating a record', async ({
    page,
  }) => {
    const personId = randomUUID();
    const response = await page.request.post(
      getWorkspaceBoundBackendGraphQLUrl({ pageUrl: page.url() }),
      {
        headers: { Origin: 'http://yc.localhost:3001' },
        data: {
          operationName: 'SecurityCreatePerson',
          query: CREATE_PERSON_MUTATION,
          variables: {
            data: {
              id: personId,
              name: { firstName: 'CSRF', lastName: 'SiblingOrigin' },
            },
          },
        },
      },
    );
    const body = await response.json();

    expect(response.status()).toBe(403);
    expect(body).toMatchObject({ error: 'CSRF_ORIGIN_MISMATCH' });
    await expectPersonNotCreated({ page, personId });
  });

  test('does not rebind an Apple-only token to the YC workspace host', async ({
    page,
    playwright,
  }) => {
    const isolatedRequest = await playwright.request.newContext({
      storageState: { cookies: [], origins: [] },
    });

    try {
      const accessToken = await getAppleOnlyAccessToken({
        request: isolatedRequest,
      });
      const response = await isolatedRequest.post(
        getWorkspaceBoundBackendMetadataGraphQLUrl({
          pageUrl: page.url(),
          hostname: 'yc.localhost',
        }),
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Origin: frontendOrigin,
          },
          data: {
            operationName: 'SecurityCurrentWorkspace',
            query: CURRENT_WORKSPACE_QUERY,
          },
        },
      );
      const body = await response.json();

      expect(body.errors).toBeUndefined();
      expect(body.data?.currentWorkspace).toMatchObject({
        displayName: 'Apple',
      });
      expect(JSON.stringify(body)).not.toContain('YCombinator');
    } finally {
      await isolatedRequest.dispose();
    }
  });

  test('denies an unauthenticated metadata query without workspace disclosure', async ({
    page,
    playwright,
  }) => {
    const unauthenticatedRequest = await playwright.request.newContext({
      storageState: { cookies: [], origins: [] },
    });

    try {
      const response = await unauthenticatedRequest.post(
        getWorkspaceBoundBackendMetadataGraphQLUrl({ pageUrl: page.url() }),
        {
          headers: { Origin: frontendOrigin },
          data: {
            operationName: 'SecurityCurrentWorkspace',
            query: CURRENT_WORKSPACE_QUERY,
          },
        },
      );
      const body = await response.json();

      expect(body.data?.currentWorkspace).toBeUndefined();
      expect(body.errors).toBeDefined();
      expect(JSON.stringify(body)).not.toContain('Apple');
    } finally {
      await unauthenticatedRequest.dispose();
    }
  });

  test('exposes live workspace-bound M5-M7 control APIs to the authorized administrator', async ({
    page,
  }) => {
    const response = await postBackendGraphQL({
      page,
      data: {
        operationName: 'SecurityIdealCrmControls',
        query: IDEAL_CRM_CONTROL_QUERY,
      },
    });
    const body = await response.json();

    expect(response.ok()).toBe(true);
    expect(body.errors).toBeUndefined();
    expect(body.data).toEqual({
      metadataChangeSets: expect.any(Array),
      configurationVersions: expect.any(Array),
      outboxOperations: expect.any(Array),
      policyAuditEvents: expect.any(Array),
      workflowOperations: expect.any(Array),
    });
  });

  test('persists an authorized tenant-bound M5 draft without applying metadata effects', async ({
    page,
  }) => {
    const currentWorkspaceResponse = await postBackendMetadataGraphQL({
      page,
      data: {
        operationName: 'SecurityCurrentWorkspace',
        query: CURRENT_WORKSPACE_QUERY,
      },
    });
    const currentWorkspaceBody = await currentWorkspaceResponse.json();
    const baseMetadataVersion =
      currentWorkspaceBody.data?.currentWorkspace?.metadataVersion;
    const operationUniversalIdentifier = randomUUID();

    expect(currentWorkspaceResponse.ok()).toBe(true);
    expect(currentWorkspaceBody.errors).toBeUndefined();
    expect(Number.isInteger(baseMetadataVersion)).toBe(true);

    const createResponse = await postBackendGraphQL({
      page,
      data: {
        operationName: 'SecurityCreateMetadataChangeSet',
        query: CREATE_METADATA_CHANGE_SET_MUTATION,
        variables: {
          input: {
            baseMetadataVersion,
            applicationUniversalIdentifier: randomUUID(),
            migrationPlan: {
              fieldMetadata: {
                flatEntityToCreate: {},
                flatEntityToUpdate: {
                  [operationUniversalIdentifier]: {
                    universalIdentifier: operationUniversalIdentifier,
                  },
                },
                flatEntityToDelete: {},
              },
            },
          },
        },
      },
    });
    const createBody = await createResponse.json();
    const createdChangeSetId = createBody.data?.createMetadataChangeSet?.id;

    expect(createResponse.ok()).toBe(true);
    expect(createBody.errors).toBeUndefined();
    expect(createBody.data?.createMetadataChangeSet).toEqual({
      id: expect.any(String),
      state: 'DRAFT',
      version: 1,
    });

    const controlsResponse = await postBackendGraphQL({
      page,
      data: {
        operationName: 'SecurityIdealCrmControls',
        query: IDEAL_CRM_CONTROL_QUERY,
      },
    });
    const controlsBody = await controlsResponse.json();

    expect(controlsResponse.ok()).toBe(true);
    expect(controlsBody.errors).toBeUndefined();
    expect(controlsBody.data?.metadataChangeSets).toContainEqual(
      expect.objectContaining({
        id: createdChangeSetId,
        state: 'DRAFT',
        baseMetadataVersion,
        appliedMetadataVersion: null,
        version: 1,
      }),
    );
  });

  test('denies live M5-M7 control APIs on a foreign workspace host', async ({
    page,
    playwright,
  }) => {
    const isolatedRequest = await playwright.request.newContext({
      storageState: { cookies: [], origins: [] },
    });

    try {
      const accessToken = await getAppleOnlyAccessToken({
        request: isolatedRequest,
      });
      const response = await isolatedRequest.post(
        getWorkspaceBoundBackendGraphQLUrl({
          pageUrl: page.url(),
          hostname: 'yc.localhost',
        }),
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Origin: frontendOrigin,
          },
          data: {
            operationName: 'SecurityIdealCrmControls',
            query: IDEAL_CRM_CONTROL_QUERY,
          },
        },
      );
      const body = await response.json();

      expect(body.data).toBeNull();
      expect(body.errors).toBeDefined();
      expect(JSON.stringify(body)).not.toContain('YCombinator');
    } finally {
      await isolatedRequest.dispose();
    }
  });

  test('denies unauthenticated live M5-M7 control APIs without workspace disclosure', async ({
    page,
    playwright,
  }) => {
    const unauthenticatedRequest = await playwright.request.newContext({
      storageState: { cookies: [], origins: [] },
    });

    try {
      const response = await unauthenticatedRequest.post(
        getWorkspaceBoundBackendGraphQLUrl({ pageUrl: page.url() }),
        {
          headers: { Origin: frontendOrigin },
          data: {
            operationName: 'SecurityIdealCrmControls',
            query: IDEAL_CRM_CONTROL_QUERY,
          },
        },
      );
      const body = await response.json();

      expect(body.data).toBeNull();
      expect(body.errors).toBeDefined();
      expect(JSON.stringify(body)).not.toContain('Apple');
    } finally {
      await unauthenticatedRequest.dispose();
    }
  });

  test('rejects a session-cookie metadata mutation without an Origin', async ({
    page,
  }) => {
    const beforeResponse = await postBackendGraphQL({
      page,
      data: {
        operationName: 'SecurityIdealCrmControls',
        query: IDEAL_CRM_CONTROL_QUERY,
      },
    });
    const beforeBody = await beforeResponse.json();

    expect(beforeResponse.ok()).toBe(true);
    expect(beforeBody.errors).toBeUndefined();

    const response = await page.request.post(
      getWorkspaceBoundBackendGraphQLUrl({ pageUrl: page.url() }),
      {
        data: {
          operationName: 'SecurityCreateMetadataChangeSet',
          query: CREATE_METADATA_CHANGE_SET_MUTATION,
          variables: {
            input: {
              baseMetadataVersion: 0,
              applicationUniversalIdentifier:
                'security-missing-origin-must-not-persist',
              migrationPlan: {},
            },
          },
        },
      },
    );
    const body = await response.json();

    expect(response.status()).toBe(403);
    expect(body).toMatchObject({ error: 'CSRF_ORIGIN_MISMATCH' });

    const afterResponse = await postBackendGraphQL({
      page,
      data: {
        operationName: 'SecurityIdealCrmControls',
        query: IDEAL_CRM_CONTROL_QUERY,
      },
    });
    const afterBody = await afterResponse.json();

    expect(afterResponse.ok()).toBe(true);
    expect(afterBody.errors).toBeUndefined();
    expect(afterBody.data?.metadataChangeSets).toEqual(
      beforeBody.data?.metadataChangeSets,
    );
  });
});
