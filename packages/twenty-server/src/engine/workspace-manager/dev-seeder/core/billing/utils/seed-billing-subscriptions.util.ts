import { isDefined } from 'twenty-shared/utils';
import { type QueryRunner } from 'typeorm';

const tableName = 'billingSubscription';
const TEST_STRIPE_CUSTOMER_ID = 'cus_default0';
const TEST_STRIPE_SUBSCRIPTION_ID = 'sub_default0';
const TEST_STRIPE_PRODUCT_ID = 'prod_resource_credit_test';
const TEST_STRIPE_PRICE_ID = 'price_resource_credit_test';
const TEST_STRIPE_SUBSCRIPTION_ITEM_ID = 'si_resource_credit_test';
const TEST_RESOURCE_CREDIT_AMOUNT_MICRO = 1_000_000;

type SeedBillingSubscriptionsArgs = {
  queryRunner: QueryRunner;
  schemaName: string;
  workspaceId: string;
};

export const seedBillingSubscriptions = async ({
  queryRunner,
  schemaName,
  workspaceId,
}: SeedBillingSubscriptionsArgs) => {
  const currentPeriodStart = new Date();
  const currentPeriodEnd = new Date(currentPeriodStart);

  currentPeriodEnd.setUTCMonth(currentPeriodEnd.getUTCMonth() + 1);

  await queryRunner.manager
    .createQueryBuilder()
    .insert()
    .into(`${schemaName}.billingProduct`, [
      'stripeProductId',
      'active',
      'name',
      'description',
      'metadata',
    ])
    .orIgnore()
    .values([
      {
        stripeProductId: TEST_STRIPE_PRODUCT_ID,
        active: true,
        name: 'Test resource credit',
        description: '',
        metadata: { productKey: 'RESOURCE_CREDIT' },
      },
    ])
    .execute();

  await queryRunner.manager
    .createQueryBuilder()
    .insert()
    .into(`${schemaName}.billingPrice`, [
      'stripePriceId',
      'stripeProductId',
      'active',
      'currency',
      'taxBehavior',
      'type',
      'billingScheme',
      'usageType',
      'interval',
      'unitAmount',
      'metadata',
    ])
    .orIgnore()
    .values([
      {
        stripePriceId: TEST_STRIPE_PRICE_ID,
        stripeProductId: TEST_STRIPE_PRODUCT_ID,
        active: true,
        currency: 'usd',
        taxBehavior: 'UNSPECIFIED',
        type: 'RECURRING',
        billingScheme: 'PER_UNIT',
        usageType: 'LICENSED',
        interval: 'month',
        unitAmount: 1_000,
        metadata: {
          credit_amount: String(TEST_RESOURCE_CREDIT_AMOUNT_MICRO),
        },
      },
    ])
    .execute();

  await queryRunner.manager
    .createQueryBuilder()
    .insert()
    .into(`${schemaName}.${tableName}`, [
      'workspaceId',
      'stripeCustomerId',
      'stripeSubscriptionId',
      'status',
      'interval',
      'currentPeriodStart',
      'currentPeriodEnd',
      'metadata',
    ])
    .orIgnore()
    .values([
      {
        workspaceId,
        stripeCustomerId: TEST_STRIPE_CUSTOMER_ID,
        stripeSubscriptionId: TEST_STRIPE_SUBSCRIPTION_ID,
        status: 'active',
        interval: 'month',
        currentPeriodStart,
        currentPeriodEnd,
        metadata: {
          workspaceId,
        },
      },
    ])
    .execute();

  const subscriptionRows: { id: string }[] = await queryRunner.query(
    `SELECT "id" FROM "${schemaName}"."${tableName}"
     WHERE "workspaceId" = $1 AND "stripeSubscriptionId" = $2`,
    [workspaceId, TEST_STRIPE_SUBSCRIPTION_ID],
  );
  const [subscription] = subscriptionRows;

  if (!isDefined(subscription)) {
    return;
  }

  await queryRunner.manager
    .createQueryBuilder()
    .insert()
    .into(`${schemaName}.billingSubscriptionItem`, [
      'billingSubscriptionId',
      'stripeSubscriptionId',
      'stripeProductId',
      'stripePriceId',
      'stripeSubscriptionItemId',
      'quantity',
    ])
    .orIgnore()
    .values([
      {
        billingSubscriptionId: subscription.id,
        stripeSubscriptionId: TEST_STRIPE_SUBSCRIPTION_ID,
        stripeProductId: TEST_STRIPE_PRODUCT_ID,
        stripePriceId: TEST_STRIPE_PRICE_ID,
        stripeSubscriptionItemId: TEST_STRIPE_SUBSCRIPTION_ITEM_ID,
        quantity: 1,
      },
    ])
    .execute();
};
