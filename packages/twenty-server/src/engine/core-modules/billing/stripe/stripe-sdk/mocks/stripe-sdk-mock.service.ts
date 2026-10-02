/* @license Enterprise */

import { Injectable } from '@nestjs/common';

import type Stripe from 'stripe';

import { StripeSDKMock } from 'src/engine/core-modules/billing/stripe/stripe-sdk/mocks/stripe-sdk.mock';
import { type StripeSDKService } from 'src/engine/core-modules/billing/stripe/stripe-sdk/services/stripe-sdk.service';

@Injectable()
export class StripeSDKMockService implements StripeSDKService {
  private readonly stripeByApiKey = new Map<string, StripeSDKMock>();

  getStripe(stripeApiKey: string) {
    const existingStripe = this.stripeByApiKey.get(stripeApiKey);

    if (existingStripe) {
      return existingStripe as unknown as Stripe;
    }

    const stripe = new StripeSDKMock(stripeApiKey);

    this.stripeByApiKey.set(stripeApiKey, stripe);

    return stripe as unknown as Stripe;
  }
}
