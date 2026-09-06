import { OutboxQueuePublisherService } from 'src/engine/core-modules/transactional-outbox/services/outbox-queue-publisher.service';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';

describe('OutboxQueuePublisherService', () => {
  const add = jest.fn();
  const service = new OutboxQueuePublisherService({ add } as never);

  beforeEach(() => jest.clearAllMocks());

  it('publishes only a durable event reference with deterministic deduplication', async () => {
    await service.publish({
      id: EVENT_ID,
      workspaceId: WORKSPACE_ID,
    } as never);

    expect(add).toHaveBeenCalledWith(
      'OutboxEventDeliveryJob',
      { outboxEventId: EVENT_ID, workspaceId: WORKSPACE_ID },
      { id: `outbox-event-${EVENT_ID}`, retryLimit: 0 },
    );
  });
});
