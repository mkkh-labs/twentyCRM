import { PageLayoutTabLayoutMode, WidgetType } from 'twenty-shared/types';

import { WidgetConfigurationType } from 'src/engine/metadata-modules/page-layout-widget/enums/widget-configuration-type.type';
import { createAddDashboardTabTool } from 'src/modules/dashboard/tools/add-dashboard-tab.tool';
import { createAddDashboardWidgetTool } from 'src/modules/dashboard/tools/add-dashboard-widget.tool';
import { createDeleteDashboardWidgetTool } from 'src/modules/dashboard/tools/delete-dashboard-widget.tool';
import { createUpdateDashboardWidgetTool } from 'src/modules/dashboard/tools/update-dashboard-widget.tool';

const WORKSPACE_ID = '20202020-aaaa-4d02-bf25-6aeccf7ea419';
const UUID = '20202020-bbbb-4d02-bf25-6aeccf7ea419';
const contextWithoutAuth = {
  workspaceId: WORKSPACE_ID,
  rolePermissionConfig: { unionOf: ['role-id'] },
};

describe('dashboard mutation tool authority boundary', () => {
  it('denies add-tab before creating a tab when caller authority is missing', async () => {
    const create = jest.fn().mockResolvedValue({ id: UUID });
    const tool = createAddDashboardTabTool(
      {
        pageLayoutService: {
          findByIdOrThrow: jest.fn().mockResolvedValue({ tabs: [] }),
        },
        pageLayoutTabService: { create },
      } as never,
      contextWithoutAuth as never,
    );

    const result = await tool.execute({ pageLayoutId: UUID, title: 'Sales' });

    expect(result.success).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it('denies add-widget before creating a widget when caller authority is missing', async () => {
    const create = jest.fn().mockResolvedValue({ id: UUID });
    const tool = createAddDashboardWidgetTool(
      {
        pageLayoutWidgetService: { create },
        flatEntityMapsCacheService: {
          getOrRecomputeManyOrAllFlatEntityMaps: jest.fn().mockResolvedValue({
            flatObjectMetadataMaps: {
              byUniversalIdentifier: {},
              universalIdentifierById: {},
              universalIdentifiersByApplicationId: {},
            },
            flatFieldMetadataMaps: {
              byUniversalIdentifier: {},
              universalIdentifierById: {},
              universalIdentifiersByApplicationId: {},
            },
          }),
        },
      } as never,
      contextWithoutAuth as never,
    );

    const result = await tool.execute({
      pageLayoutTabId: UUID,
      title: 'CRM',
      type: WidgetType.IFRAME,
      position: {
        layoutMode: PageLayoutTabLayoutMode.GRID,
        row: 0,
        column: 0,
        rowSpan: 4,
        columnSpan: 4,
      },
      configuration: {
        configurationType: WidgetConfigurationType.IFRAME,
        url: 'https://example.com',
      },
    });

    expect(result.success).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it('denies update-widget before updating a widget when caller authority is missing', async () => {
    const update = jest.fn().mockResolvedValue({ id: UUID });
    const tool = createUpdateDashboardWidgetTool(
      {
        pageLayoutWidgetService: { update },
        flatEntityMapsCacheService: {},
      } as never,
      contextWithoutAuth as never,
    );

    const result = await tool.execute({ widgetId: UUID, title: 'Updated' });

    expect(result.success).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it('denies delete-widget before destroying a widget when caller authority is missing', async () => {
    const destroy = jest.fn().mockResolvedValue(undefined);
    const tool = createDeleteDashboardWidgetTool(
      {
        pageLayoutWidgetService: {
          findByIdOrThrow: jest.fn().mockResolvedValue({ title: 'CRM' }),
          destroy,
        },
      } as never,
      contextWithoutAuth as never,
    );

    const result = await tool.execute({ widgetId: UUID });

    expect(result.success).toBe(false);
    expect(destroy).not.toHaveBeenCalled();
  });
});
