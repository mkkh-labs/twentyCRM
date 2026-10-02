import { createListDashboardsTool } from 'src/modules/dashboard/tools/list-dashboards.tool';

const WORKSPACE_ID = '20202020-aaaa-4d02-bf25-6aeccf7ea419';

describe('list_dashboards tool authority boundary', () => {
  it('reads dashboard records with the resolved caller authority', async () => {
    const rolePermissionConfig = { unionOf: ['role-id'] };
    const authContext = { workspace: { id: WORKSPACE_ID } };
    const dashboard = {
      id: 'dashboard-id',
      title: 'Pipeline',
      pageLayoutId: 'page-layout-id',
      position: 0,
    };
    const workspaceOrmManager = {
      executeInWorkspaceContext: jest.fn(async (work, suppliedAuthContext) => {
        if (suppliedAuthContext !== authContext) {
          throw new Error('Dashboard list used the wrong auth context');
        }

        return work();
      }),
      getRepository: jest.fn((_name, permissions) => {
        if (permissions !== rolePermissionConfig) {
          throw new Error('Dashboard list bypassed role permissions');
        }

        return { find: jest.fn().mockResolvedValue([dashboard]) };
      }),
    };

    const tool = createListDashboardsTool(
      { workspaceOrmManager } as never,
      {
        workspaceId: WORKSPACE_ID,
        authContext,
        rolePermissionConfig,
      } as never,
    );

    const result = await tool.execute({ limit: 20 });

    expect(result).toMatchObject({
      success: true,
      result: {
        count: 1,
        dashboards: [{ id: dashboard.id, title: dashboard.title }],
      },
    });
  });
});
