import { z } from 'zod';

import { type ToolProviderContext } from 'src/engine/core-modules/tool-provider/interfaces/tool-provider-context.type';
import { DashboardToolProvider } from 'src/engine/core-modules/tool-provider/providers/dashboard-tool.provider';

const WORKSPACE_ID = '20202020-aaaa-4d02-bf25-6aeccf7ea419';
const DASHBOARD_OBJECT_ID = '20202020-bbbb-4d02-bf25-6aeccf7ea419';
const ROLE_ID = '20202020-cccc-4d02-bf25-6aeccf7ea419';

const toolNames = [
  'create_complete_dashboard',
  'list_dashboards',
  'get_dashboard',
  'add_dashboard_tab',
  'add_dashboard_widget',
  'update_dashboard_widget',
  'delete_dashboard_widget',
] as const;

const context: ToolProviderContext = {
  workspaceId: WORKSPACE_ID,
  roleId: ROLE_ID,
  rolePermissionConfig: { unionOf: [ROLE_ID] },
};

const buildProvider = ({
  canReadObjectRecords,
  canUpdateObjectRecords,
  restrictedFieldPermission,
  hasRowRestrictions = false,
}: {
  canReadObjectRecords: boolean;
  canUpdateObjectRecords: boolean;
  restrictedFieldPermission?: { canRead: boolean; canUpdate: boolean };
  hasRowRestrictions?: boolean;
}) => {
  const toolSet = Object.fromEntries(
    toolNames.map((name) => [
      name,
      {
        description: name,
        inputSchema: z.object({}),
        execute: jest.fn(),
      },
    ]),
  );
  const dashboardToolService = {
    generateDashboardTools: jest.fn().mockReturnValue(toolSet),
  };
  const permissionsService = {
    checkRolesPermissions: jest.fn().mockResolvedValue(true),
  };
  const flatEntityMapsCacheService = {
    getOrRecomputeManyOrAllFlatEntityMaps: jest.fn().mockResolvedValue({
      flatObjectMetadataMaps: {
        byUniversalIdentifier: {
          dashboard: {
            id: DASHBOARD_OBJECT_ID,
            nameSingular: 'dashboard',
            icon: 'IconLayoutDashboard',
          },
        },
      },
    }),
  };
  const workspaceCacheService = {
    getOrRecompute: jest.fn().mockResolvedValue({
      rolesPermissions: {
        [ROLE_ID]: {
          [DASHBOARD_OBJECT_ID]: {
            canReadObjectRecords,
            canUpdateObjectRecords,
            canSoftDeleteObjectRecords: false,
            canDestroyObjectRecords: false,
            restrictedFields: restrictedFieldPermission
              ? { 'field-id': restrictedFieldPermission }
              : {},
            rowLevelPermissionPredicates: hasRowRestrictions
              ? [{ id: 'predicate-id' }]
              : [],
            rowLevelPermissionPredicateGroups: [],
          },
        },
      },
    }),
  };

  const provider = Reflect.construct(DashboardToolProvider, [
    dashboardToolService,
    permissionsService,
    flatEntityMapsCacheService,
    workspaceCacheService,
  ]) as DashboardToolProvider;

  return { provider };
};

describe('DashboardToolProvider object authority', () => {
  it('exposes no dashboard tools without dashboard read authority', async () => {
    const { provider } = buildProvider({
      canReadObjectRecords: false,
      canUpdateObjectRecords: false,
    });

    await expect(provider.generateDescriptors(context)).resolves.toEqual([]);
  });

  it('exposes only read tools to a dashboard read-only role', async () => {
    const { provider } = buildProvider({
      canReadObjectRecords: true,
      canUpdateObjectRecords: false,
    });

    const descriptors = await provider.generateDescriptors(context);

    expect(descriptors.map(({ name }) => name)).toEqual([
      'list_dashboards',
      'get_dashboard',
    ]);
  });

  it('denies composite tools when dashboard fields are restricted', async () => {
    const { provider } = buildProvider({
      canReadObjectRecords: true,
      canUpdateObjectRecords: true,
      restrictedFieldPermission: { canRead: false, canUpdate: false },
    });

    await expect(provider.generateDescriptors(context)).resolves.toEqual([]);
  });

  it('keeps reads but denies composite tools for update-only restrictions', async () => {
    const { provider } = buildProvider({
      canReadObjectRecords: true,
      canUpdateObjectRecords: true,
      restrictedFieldPermission: { canRead: true, canUpdate: false },
    });

    const descriptors = await provider.generateDescriptors(context);

    expect(descriptors.map(({ name }) => name)).toEqual([
      'list_dashboards',
      'get_dashboard',
    ]);
  });

  it('keeps scoped reads but denies composite tools for row restrictions', async () => {
    const { provider } = buildProvider({
      canReadObjectRecords: true,
      canUpdateObjectRecords: true,
      hasRowRestrictions: true,
    });

    const descriptors = await provider.generateDescriptors(context);

    expect(descriptors.map(({ name }) => name)).toEqual([
      'list_dashboards',
      'get_dashboard',
    ]);
  });
});
