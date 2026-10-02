import { UPDATE_SUBSCRIPTION_QUANTITY_JOB_DELAY_MS } from 'src/engine/core-modules/billing/constants/update-subscription-quantity-job-delay-ms.constant';
import { UpdateSubscriptionQuantityJob } from 'src/engine/core-modules/billing/jobs/update-subscription-quantity.job';
import { BillingWorkspaceMemberListener } from 'src/engine/core-modules/billing/listeners/billing-workspace-member.listener';

describe('BillingWorkspaceMemberListener reliability boundary', () => {
  it('enqueues bounded retries for the idempotent seat update job', async () => {
    const messageQueueService = {
      add: jest.fn().mockResolvedValue(undefined),
    };
    const twentyConfigService = {
      get: jest.fn().mockReturnValue(true),
    };
    const listener = new BillingWorkspaceMemberListener(
      messageQueueService as never,
      twentyConfigService as never,
    );

    await listener.handleCreateOrDeleteEvent({
      workspaceId: 'workspace-1',
      events: [],
      name: 'workspaceMember.created',
    } as never);

    expect(messageQueueService.add).toHaveBeenCalledWith(
      UpdateSubscriptionQuantityJob.name,
      {
        workspaceId: 'workspace-1',
        operationId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        ),
      },
      {
        delay: UPDATE_SUBSCRIPTION_QUANTITY_JOB_DELAY_MS,
        retryLimit: 2,
        backoff: {
          strategy: 'exponential',
          initialDelayMilliseconds: 30_000,
          jitter: 0.2,
        },
      },
    );
  });
});
