import { BillingPlanKey } from 'src/engine/core-modules/billing/enums/billing-plan-key.enum';
import { BillingProductKey } from 'src/engine/core-modules/billing/enums/billing-product-key.enum';
import { SubscriptionInterval } from 'src/engine/core-modules/billing/enums/billing-subscription-interval.enum';
import { SubscriptionStatus } from 'src/engine/core-modules/billing/enums/billing-subscription-status.enum';
import { BillingSubscriptionUpdateService } from 'src/engine/core-modules/billing/services/billing-subscription-update.service';

describe('BillingSubscriptionUpdateService idempotency boundary', () => {
  it('propagates the seat update idempotency key to Stripe', async () => {
    const stripeSubscriptionService = {
      updateSubscription: jest.fn().mockResolvedValue(undefined),
    };
    const billingSubscriptionRepository = {
      findOneOrFail: jest.fn().mockResolvedValue({
        id: 'billing-subscription-1',
        workspaceId: 'workspace-1',
        stripeSubscriptionId: 'stripe-subscription-1',
        stripeCustomerId: 'stripe-customer-1',
        status: SubscriptionStatus.Active,
        interval: SubscriptionInterval.Month,
        currentPeriodEnd: new Date('2026-10-01T00:00:00.000Z'),
        billingSubscriptionItems: [
          {
            stripePriceId: 'price-base',
            stripeSubscriptionItemId: 'item-base',
            quantity: 2,
            billingProduct: {
              metadata: {
                productKey: BillingProductKey.BASE_PRODUCT,
                planKey: BillingPlanKey.PRO,
              },
            },
          },
          {
            stripePriceId: 'price-credit',
            stripeSubscriptionItemId: 'item-credit',
            quantity: 1,
            billingProduct: {
              metadata: { productKey: BillingProductKey.RESOURCE_CREDIT },
            },
          },
        ],
      }),
    };
    const stripeSubscriptionScheduleService = {
      loadSubscriptionSchedule: jest.fn().mockResolvedValue({}),
    };
    const billingSubscriptionService = {
      getCurrentBillingSubscriptionOrThrow: jest.fn().mockResolvedValue({
        id: 'billing-subscription-1',
      }),
      syncSubscriptionToDatabase: jest.fn().mockResolvedValue(undefined),
    };
    const service = new BillingSubscriptionUpdateService(
      stripeSubscriptionService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      billingSubscriptionRepository as never,
      stripeSubscriptionScheduleService as never,
      {} as never,
      billingSubscriptionService as never,
    );

    await service.changeSeats('workspace-1', 3, {
      idempotencyKey: 'billing-job-key-1',
    });

    expect(stripeSubscriptionService.updateSubscription).toHaveBeenCalledWith(
      'stripe-subscription-1',
      {
        items: [
          { id: 'item-base', price: 'price-base', quantity: 3 },
          { id: 'item-credit', price: 'price-credit', quantity: 1 },
        ],
        proration_behavior: 'always_invoice',
      },
      { idempotencyKey: 'billing-job-key-1' },
    );
    expect(
      billingSubscriptionService.syncSubscriptionToDatabase,
    ).toHaveBeenCalledWith('workspace-1', 'stripe-subscription-1');
  });
});
