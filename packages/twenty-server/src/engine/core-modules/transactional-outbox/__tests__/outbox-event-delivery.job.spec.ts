import { OutboxEventDeliveryJob } from 'src/engine/core-modules/transactional-outbox/jobs/outbox-event-delivery.job';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';

describe('OutboxEventDeliveryJob', () => {
  const consume = jest.fn();
  const job = new OutboxEventDeliveryJob({ consume } as never);

  beforeEach(() => jest.clearAllMocks());

  it('accepts only a strict tenant-bound event reference', async () => {
    consume.mockResolvedValue({ status: 'DELIVERED' });

    await job.handle({ outboxEventId: EVENT_ID, workspaceId: WORKSPACE_ID });

    expect(consume).toHaveBeenCalledWith({
      outboxEventId: EVENT_ID,
      workspaceId: WORKSPACE_ID,
    });
  });

  it.each([
    [{ outboxEventId: 'invalid', workspaceId: WORKSPACE_ID }],
    [{ outboxEventId: EVENT_ID, workspaceId: 'invalid' }],
    [
      {
        outboxEventId: EVENT_ID,
        workspaceId: WORKSPACE_ID,
        shouldBypassPermissionChecks: true,
      },
    ],
  ])('denies malformed delivery data before consumption', async (data) => {
    await expect(job.handle(data as never)).rejects.toThrow(
      'Outbox delivery job data is invalid',
    );
    expect(consume).not.toHaveBeenCalled();
  });
});
