import { randomUUID } from 'node:crypto';

import gql from 'graphql-tag';

import { expectOneNotInternalServerErrorSnapshot } from 'test/integration/graphql/utils/expect-one-not-internal-server-error-snapshot.util';
import { findManyOperationFactory } from 'test/integration/graphql/utils/find-many-operation-factory.util';
import { generateApiKeyToken } from 'test/integration/graphql/utils/generate-api-key-token.util';
import { makeGraphqlAPIRequest } from 'test/integration/graphql/utils/make-graphql-api-request.util';
import {
  createTestDashboardWithGraphQL,
  destroyDashboardWithGraphQL,
} from 'test/integration/metadata/suites/dashboard/utils/dashboard-graphql.util';
import { duplicateOneDashboardQueryFactory } from 'test/integration/metadata/suites/dashboard/utils/duplicate-one-dashboard-query-factory.util';
import { duplicateOneDashboard } from 'test/integration/metadata/suites/dashboard/utils/duplicate-one-dashboard.util';
import { findPageLayouts } from 'test/integration/metadata/suites/page-layout/utils/find-page-layouts.util';
import { destroyOnePageLayout } from 'test/integration/metadata/suites/page-layout/utils/destroy-one-page-layout.util';
import { createOneRole } from 'test/integration/metadata/suites/role/utils/create-one-role.util';
import { deleteOneRole } from 'test/integration/metadata/suites/role/utils/delete-one-role.util';
import { makeMetadataAPIRequest } from 'test/integration/metadata/suites/utils/make-metadata-api-request.util';
import { jestExpectToBeDefined } from 'test/utils/jest-expect-to-be-defined.util.test';
import {
  type EachTestingContext,
  eachTestingContextFilter,
} from 'twenty-shared/testing';
import { isDefined } from 'twenty-shared/utils';

type TestContext = {
  dashboardId: string | (() => Promise<string>);
  cleanupDashboardId?: boolean;
};

type GlobalTestContext = {
  dashboardWithDeletedPageLayoutId?: string;
};

const globalTestContext: GlobalTestContext = {};

const FAILING_TEST_CASES: EachTestingContext<TestContext>[] = [
  {
    title: 'when dashboard does not exist',
    context: {
      dashboardId: '7f7b4ae6-ebe4-4d7b-91a9-0043dffd5837',
    },
  },
  {
    title: 'when dashboard page layout was deleted',
    context: {
      dashboardId: async () => {
        const dashboard = await createTestDashboardWithGraphQL({
          id: '8cbbc499-5a23-473d-ad0b-eaa92d4c9831',
          title: 'Dashboard With Deleted Page Layout',
        });

        globalTestContext.dashboardWithDeletedPageLayoutId = dashboard.id;

        if (isDefined(dashboard.pageLayoutId)) {
          await destroyOnePageLayout({
            expectToFail: false,
            input: { id: dashboard.pageLayoutId },
          });
        }

        return dashboard.id;
      },
      cleanupDashboardId: true,
    },
  },
];

describe('Dashboard duplication should fail', () => {
  afterEach(async () => {
    if (isDefined(globalTestContext.dashboardWithDeletedPageLayoutId)) {
      await destroyDashboardWithGraphQL(
        globalTestContext.dashboardWithDeletedPageLayoutId,
      );
      globalTestContext.dashboardWithDeletedPageLayoutId = undefined;
    }
  });

  it.each(eachTestingContextFilter(FAILING_TEST_CASES))(
    '$title',
    async ({ context }) => {
      const dashboardId =
        typeof context.dashboardId === 'function'
          ? await context.dashboardId()
          : context.dashboardId;

      const { errors } = await duplicateOneDashboard({
        expectToFail: true,
        input: { id: dashboardId },
      });

      expectOneNotInternalServerErrorSnapshot({ errors });
    },
  );

  it('denies a caller without dashboard permissions before creating metadata', async () => {
    const dashboard = await createTestDashboardWithGraphQL({
      title: `Restricted Dashboard ${randomUUID()}`,
    });
    const copyTitle = `${dashboard.title} (Copy)`;
    const { data: roleData } = await createOneRole({
      expectToFail: false,
      input: {
        label: `Dashboard Restricted ${randomUUID()}`,
        description: 'API-key role without dashboard record permissions',
        icon: 'IconKey',
        canUpdateAllSettings: false,
        canAccessAllTools: false,
        canReadAllObjectRecords: false,
        canUpdateAllObjectRecords: false,
        canSoftDeleteAllObjectRecords: false,
        canDestroyAllObjectRecords: false,
        canBeAssignedToUsers: false,
        canBeAssignedToAgents: false,
        canBeAssignedToApiKeys: true,
      },
    });
    const roleId = roleData.createOneRole.id;
    const createApiKeyResponse = await makeMetadataAPIRequest({
      query: gql`
        mutation CreateDashboardRestrictedApiKey($input: CreateApiKeyInput!) {
          createApiKey(input: $input) {
            id
          }
        }
      `,
      variables: {
        input: {
          name: `Dashboard restricted key ${randomUUID()}`,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          roleId,
        },
      },
    });
    const apiKeyId = createApiKeyResponse.body.data?.createApiKey?.id;

    jestExpectToBeDefined(apiKeyId);

    const tokenResponse = await generateApiKeyToken({
      apiKeyId,
      accessToken: APPLE_JANE_ADMIN_ACCESS_TOKEN,
    });
    const restrictedApiKeyToken =
      tokenResponse.body.data?.generateApiKeyToken?.token;

    jestExpectToBeDefined(restrictedApiKeyToken);

    const { data: pageLayoutsBeforeData } = await findPageLayouts({
      input: {},
      expectToFail: false,
    });
    let unauthorizedDashboardId: string | undefined;

    try {
      const duplicateResponse = await makeMetadataAPIRequest(
        duplicateOneDashboardQueryFactory({ input: { id: dashboard.id } }),
        restrictedApiKeyToken,
      );
      const { data, errors } = duplicateResponse.body;

      unauthorizedDashboardId = data?.duplicateDashboard?.id;

      expect(errors).toEqual([
        expect.objectContaining({
          extensions: expect.objectContaining({
            subCode: 'PERMISSION_DENIED',
          }),
        }),
      ]);
      expect(data?.duplicateDashboard).toBeUndefined();

      const { data: pageLayoutsAfterData } = await findPageLayouts({
        input: {},
        expectToFail: false,
      });
      const dashboardCopiesResponse = await makeGraphqlAPIRequest(
        findManyOperationFactory({
          objectMetadataSingularName: 'dashboard',
          objectMetadataPluralName: 'dashboards',
          gqlFields: 'id',
          filter: { title: { eq: copyTitle } },
          first: 10,
        }),
      );

      expect(pageLayoutsAfterData.getPageLayouts).toHaveLength(
        pageLayoutsBeforeData.getPageLayouts.length,
      );
      expect(dashboardCopiesResponse.body.data?.dashboards?.edges).toEqual([]);
    } finally {
      if (isDefined(unauthorizedDashboardId)) {
        await destroyDashboardWithGraphQL(unauthorizedDashboardId);
      }

      await destroyDashboardWithGraphQL(dashboard.id);
      await testDataSource.query('DELETE FROM core."apiKey" WHERE id = $1', [
        apiKeyId,
      ]);
      await deleteOneRole({
        expectToFail: false,
        input: { idToDelete: roleId },
      });
    }
  });
});
