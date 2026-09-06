import { StripeSubscriptionScheduleService } from 'src/engine/core-modules/billing/stripe/services/stripe-subscription-schedule.service';

describe('StripeSubscriptionScheduleService idempotency boundary', () => {
  it('forwards explicit request identity to a schedule update', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'schedule-1' });
    const stripeSdkService = {
      getStripe: jest.fn().mockReturnValue({
        subscriptionSchedules: { update },
      }),
    };
    const twentyConfigService = {
      get: jest.fn((key: string) =>
        key === 'IS_BILLING_ENABLED' ? true : 'stripe-key',
      ),
    };
    const service = new StripeSubscriptionScheduleService(
      twentyConfigService as never,
      stripeSdkService as never,
    );

    await service.updateSchedule(
      'schedule-1',
      { phases: [] },
      { idempotencyKey: 'billing-job-key-1-schedule' },
    );

    expect(update).toHaveBeenCalledWith(
      'schedule-1',
      { phases: [], proration_behavior: 'none' },
      { idempotencyKey: 'billing-job-key-1-schedule' },
    );
  });
});
