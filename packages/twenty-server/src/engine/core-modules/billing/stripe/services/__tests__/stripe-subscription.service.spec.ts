import { StripeSubscriptionService } from 'src/engine/core-modules/billing/stripe/services/stripe-subscription.service';

describe('StripeSubscriptionService idempotency boundary', () => {
  it('forwards explicit request identity to a subscription update', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'subscription-1' });
    const stripeSdkService = {
      getStripe: jest.fn().mockReturnValue({ subscriptions: { update } }),
    };
    const twentyConfigService = {
      get: jest.fn((key: string) =>
        key === 'IS_BILLING_ENABLED' ? true : 'stripe-key',
      ),
    };
    const service = new StripeSubscriptionService(
      twentyConfigService as never,
      stripeSdkService as never,
    );

    await service.updateSubscription(
      'subscription-1',
      { metadata: { source: 'billing-job' } },
      { idempotencyKey: 'billing-job-key-1' },
    );

    expect(update).toHaveBeenCalledWith(
      'subscription-1',
      { metadata: { source: 'billing-job' } },
      { idempotencyKey: 'billing-job-key-1' },
    );
  });
});
