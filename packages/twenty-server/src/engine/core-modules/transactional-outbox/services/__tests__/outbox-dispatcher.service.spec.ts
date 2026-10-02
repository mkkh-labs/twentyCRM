import { OutboxDispatcherService } from 'src/engine/core-modules/transactional-outbox/services/outbox-dispatcher.service';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';

describe('OutboxDispatcherService', () => {
  const repository = {
    find: jest.fn(),
    update: jest.fn(),
  };
  const publisher = { publish: jest.fn() };
  const service = new OutboxDispatcherService(repository as never, publisher);

  beforeEach(() => jest.resetAllMocks());

  it('publishes a claimed event once and records completion', async () => {
    repository.find.mockResolvedValue([
      {
        id: EVENT_ID,
        workspaceId: WORKSPACE_ID,
        eventType: 'record.updated',
        schemaVersion: 1,
        payload: { recordId: 'record-1' },
        rootCorrelationId: '33333333-3333-4333-8333-333333333333',
        attemptCount: 0,
      },
    ]);
    repository.update
      .mockResolvedValueOnce({ affected: 0 })
      .mockResolvedValueOnce({ affected: 1 })
      .mockResolvedValueOnce({ affected: 1 });
    publisher.publish.mockResolvedValue(undefined);

    await expect(service.dispatchDue()).resolves.toEqual({
      dead: 0,
      published: 1,
      reconciliationRequired: 0,
      retried: 0,
      skipped: 0,
    });
    expect(publisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ id: EVENT_ID }),
    );
    expect(repository.update).toHaveBeenLastCalledWith(
      { id: EVENT_ID, workspaceId: WORKSPACE_ID, state: 'DISPATCHING' },
      expect.objectContaining({ state: 'PUBLISHED' }),
    );
  });

  it('skips an event lost to a concurrent claimant', async () => {
    repository.find.mockResolvedValue([
      { id: EVENT_ID, workspaceId: WORKSPACE_ID },
    ]);
    repository.update.mockResolvedValue({ affected: 0 });

    await expect(service.dispatchDue()).resolves.toEqual({
      dead: 0,
      published: 0,
      reconciliationRequired: 0,
      retried: 0,
      skipped: 1,
    });
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('moves a failed publish to retry and eventually dead-letters it', async () => {
    repository.find.mockResolvedValue([
      {
        id: EVENT_ID,
        workspaceId: WORKSPACE_ID,
        attemptCount: 2,
      },
    ]);
    repository.update
      .mockResolvedValueOnce({ affected: 0 })
      .mockResolvedValue({ affected: 1 });
    publisher.publish.mockRejectedValue(new Error('provider unavailable'));

    await expect(service.dispatchDue({ maxAttempts: 3 })).resolves.toEqual({
      dead: 1,
      published: 0,
      reconciliationRequired: 0,
      retried: 0,
      skipped: 0,
    });
    expect(repository.update).toHaveBeenLastCalledWith(
      { id: EVENT_ID, workspaceId: WORKSPACE_ID, state: 'DISPATCHING' },
      expect.objectContaining({
        attemptCount: 3,
        lastErrorCode: 'OUTBOX_PUBLISH_FAILED',
        state: 'DEAD',
      }),
    );
  });

  it('never retries when publishing succeeds but durable completion fails', async () => {
    repository.find.mockResolvedValue([
      {
        id: EVENT_ID,
        workspaceId: WORKSPACE_ID,
        attemptCount: 0,
      },
    ]);
    repository.update
      .mockResolvedValueOnce({ affected: 0 })
      .mockResolvedValueOnce({ affected: 1 })
      .mockResolvedValueOnce({ affected: 0 })
      .mockResolvedValueOnce({ affected: 1 });
    publisher.publish.mockResolvedValue(undefined);

    await expect(service.dispatchDue()).resolves.toEqual({
      dead: 0,
      published: 0,
      reconciliationRequired: 1,
      retried: 0,
      skipped: 0,
    });
    expect(repository.update).toHaveBeenLastCalledWith(
      { id: EVENT_ID, workspaceId: WORKSPACE_ID },
      expect.objectContaining({
        lastErrorCode: 'OUTBOX_PUBLISH_OUTCOME_UNCERTAIN',
        state: 'RECONCILIATION_REQUIRED',
      }),
    );
  });

  it('moves an expired dispatch claim to reconciliation instead of retrying it', async () => {
    repository.update.mockResolvedValueOnce({ affected: 1 });
    repository.find.mockResolvedValue([]);

    await expect(service.dispatchDue()).resolves.toEqual({
      dead: 0,
      published: 0,
      reconciliationRequired: 1,
      retried: 0,
      skipped: 0,
    });
    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'DISPATCHING' }),
      {
        state: 'RECONCILIATION_REQUIRED',
        lastErrorCode: 'OUTBOX_CLAIM_OUTCOME_UNCERTAIN',
      },
    );
    expect(publisher.publish).not.toHaveBeenCalled();
  });
});
