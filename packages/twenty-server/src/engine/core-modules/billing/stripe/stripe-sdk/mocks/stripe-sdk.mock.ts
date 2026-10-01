/* @license Enterprise */

import { randomUUID } from 'node:crypto';

import type Stripe from 'stripe';

export class StripeSDKMock {
  private readonly pricesById = new Map<string, Stripe.Price>();
  private readonly subscriptionsById = new Map<string, Stripe.Subscription>();

  constructor(private readonly _apiKey: string) {}

  customers = {
    create: (_params: Stripe.CustomerCreateParams) => ({
      id: `cus_test_${randomUUID()}`,
    }),
    update: (_id: string, _params?: Stripe.CustomerUpdateParams) => {
      return;
    },
  };

  prices = {
    retrieve: async (priceId: string) => {
      const price = this.pricesById.get(priceId);

      if (!price) {
        throw new Error(`Stripe price ${priceId} was not found in the mock`);
      }

      return price;
    },
  };

  subscriptions = {
    retrieve: async (subscriptionId: string) => {
      const subscription = this.subscriptionsById.get(subscriptionId);

      if (!subscription) {
        throw new Error(
          `Stripe subscription ${subscriptionId} was not found in the mock`,
        );
      }

      return subscription;
    },
    list: ({ customer }: Stripe.SubscriptionListParams) => ({
      autoPagingToArray: async () =>
        [...this.subscriptionsById.values()].filter(
          (subscription) => subscription.customer === customer,
        ),
    }),
  };

  webhooks = {
    constructEvent: (
      payload: Buffer,
      signature: string,
      _webhookSecret: string,
    ) => {
      if (signature === 'correct-signature') {
        const body = JSON.parse(payload.toString()) as Stripe.Event;

        if (body.type === 'price.created' || body.type === 'price.updated') {
          this.pricesById.set(body.data.object.id, body.data.object);
        }

        if (
          body.type === 'customer.subscription.created' ||
          body.type === 'customer.subscription.updated' ||
          body.type === 'customer.subscription.deleted'
        ) {
          this.subscriptionsById.set(body.data.object.id, body.data.object);
        }

        return {
          type: body.type,
          data: body.data,
        };
      }
      throw new Error('Invalid signature');
    },
  };
}
