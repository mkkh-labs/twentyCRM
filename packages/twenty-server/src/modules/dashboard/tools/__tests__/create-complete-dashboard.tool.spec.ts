import { createCreateCompleteDashboardTool } from 'src/modules/dashboard/tools/create-complete-dashboard.tool';

const WORKSPACE_ID = '20202020-aaaa-4d02-bf25-6aeccf7ea419';

const buildDependencies = () => {
  const pageLayoutCreate = jest.fn().mockResolvedValue({ id: 'layout-id' });
  const pageLayoutTabCreate = jest.fn().mockResolvedValue({ id: 'tab-id' });
  const dashboardInsert = jest.fn().mockResolvedValue(undefined);

  return {
    pageLayoutCreate,
    dashboardInsert,
    dependencies: {
      pageLayoutService: { create: pageLayoutCreate },
      pageLayoutTabService: { create: pageLayoutTabCreate },
      pageLayoutWidgetService: { create: jest.fn() },
      workspaceOrmManager: {
        executeInWorkspaceContext: jest.fn(async (work) => work()),
        getRepository: jest.fn().mockReturnValue({ insert: dashboardInsert }),
      },
      recordPositionService: {
        buildRecordPosition: jest.fn().mockResolvedValue(0),
      },
      applicationService: {},
      flatEntityMapsCacheService: {},
    },
  };
};

describe('create_complete_dashboard tool authority boundary', () => {
  it('denies missing caller authority before creating layout state', async () => {
    const { dependencies, pageLayoutCreate, dashboardInsert } =
      buildDependencies();
    const tool = createCreateCompleteDashboardTool(dependencies as never, {
      workspaceId: WORKSPACE_ID,
      rolePermissionConfig: { unionOf: ['role-id'] },
    });

    const result = await tool.execute({ title: 'Pipeline' });

    expect(result.success).toBe(false);
    expect(pageLayoutCreate).not.toHaveBeenCalled();
    expect(dashboardInsert).not.toHaveBeenCalled();
  });
});
