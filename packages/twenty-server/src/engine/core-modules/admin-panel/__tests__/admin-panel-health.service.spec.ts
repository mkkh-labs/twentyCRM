import { AdminPanelHealthService } from 'src/engine/core-modules/admin-panel/admin-panel-health.service';

const createHealthyIndicator = (indicatorId: string) => ({
  isHealthy: jest.fn().mockResolvedValue({
    [indicatorId]: {
      status: 'up',
    },
  }),
});

describe('AdminPanelHealthService', () => {
  it('includes Ideal CRM operational readiness in system health', async () => {
    const service = new AdminPanelHealthService(
      createHealthyIndicator('database') as never,
      createHealthyIndicator('redis') as never,
      createHealthyIndicator('worker') as never,
      createHealthyIndicator('connectedAccount') as never,
      createHealthyIndicator('app') as never,
      createHealthyIndicator('idealCrm') as never,
      {} as never,
    );

    const result = await service.getSystemHealthStatus();

    expect(result.services.map(({ id }) => id)).toContain('idealCrm');
  });
});
