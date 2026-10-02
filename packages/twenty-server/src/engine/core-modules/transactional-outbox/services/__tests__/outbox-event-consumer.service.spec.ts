import { OutboxEventConsumerService } from 'src/engine/core-modules/transactional-outbox/services/outbox-event-consumer.service';
import { buildDeterministicDigest } from 'src/engine/core-modules/policy/utils/build-deterministic-digest.util';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';

describe('OutboxEventConsumerService', () => {
  const receiptRepository = {
    findOne: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  };
  const eventRepository = { findOne: jest.fn(), update: jest.fn() };
  const eventEmitter = { emitAsync: jest.fn() };
  const service = new OutboxEventConsumerService(
    receiptRepository as never,
    eventRepository as never,
    eventEmitter as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    eventRepository.findOne.mockResolvedValue({
      id: EVENT_ID,
      workspaceId: WORKSPACE_ID,
      eventType: 'configuration.version.created',
      schemaVersion: 1,
      aggregateType: 'configurationVersion',
      aggregateId: 'version-id',
      payload: {},
      payloadDigest: buildDeterministicDigest({}),
      rootCorrelationId: '33333333-3333-4333-8333-333333333333',
      state: 'PUBLISHED',
    });
  });

  it('delivers an event once and durably completes its receipt', async () => {
    receiptRepository.findOne.mockResolvedValue(null);
    receiptRepository.insert.mockResolvedValue({ identifiers: [{}] });
    eventRepository.findOne.mockResolvedValue({
      id: EVENT_ID,
      workspaceId: WORKSPACE_ID,
      eventType: 'configuration.version.created',
      schemaVersion: 1,
      aggregateType: 'configurationVersion',
      aggregateId: 'version-id',
      payload: { configurationVersionId: 'version-id' },
      payloadDigest: buildDeterministicDigest({
        configurationVersionId: 'version-id',
      }),
      rootCorrelationId: '33333333-3333-4333-8333-333333333333',
      state: 'DISPATCHING',
    });
    eventEmitter.emitAsync.mockResolvedValue([]);
    receiptRepository.update.mockResolvedValue({ affected: 1 });
    eventRepository.update.mockResolvedValue({ affected: 1 });

    await expect(
      service.consume({ outboxEventId: EVENT_ID, workspaceId: WORKSPACE_ID }),
    ).resolves.toEqual({ status: 'DELIVERED' });

    expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
      'outbox.configuration.version.created.v1',
      expect.objectContaining({ eventId: EVENT_ID, workspaceId: WORKSPACE_ID }),
    );
    expect(receiptRepository.update).toHaveBeenCalledWith(
      WORKSPACE_ID,
      expect.objectContaining({
        outboxEventId: EVENT_ID,
        state: 'PROCESSING',
      }),
      expect.objectContaining({ state: 'COMPLETED' }),
    );
  });

  it('skips a completed receipt without repeating the effect', async () => {
    receiptRepository.findOne.mockResolvedValue({ state: 'COMPLETED' });

    await expect(
      service.consume({ outboxEventId: EVENT_ID, workspaceId: WORKSPACE_ID }),
    ).resolves.toEqual({ status: 'ALREADY_DELIVERED' });

    expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
  });

  it('moves an interrupted prior delivery to reconciliation without replay', async () => {
    receiptRepository.findOne.mockResolvedValue({ state: 'PROCESSING' });
    receiptRepository.update.mockResolvedValue({ affected: 1 });
    eventRepository.update.mockResolvedValue({ affected: 1 });

    await expect(
      service.consume({ outboxEventId: EVENT_ID, workspaceId: WORKSPACE_ID }),
    ).resolves.toEqual({ status: 'RECONCILIATION_REQUIRED' });

    expect(receiptRepository.update).toHaveBeenCalledWith(
      WORKSPACE_ID,
      expect.objectContaining({ outboxEventId: EVENT_ID }),
      expect.objectContaining({
        state: 'RECONCILIATION_REQUIRED',
        lastErrorCode: 'OUTBOX_CONSUMER_OUTCOME_UNCERTAIN',
      }),
    );
    expect(eventRepository.update).toHaveBeenCalledWith(
      WORKSPACE_ID,
      { id: EVENT_ID },
      {
        state: 'RECONCILIATION_REQUIRED',
        lastErrorCode: 'OUTBOX_CONSUMER_OUTCOME_UNCERTAIN',
      },
    );
    expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
  });

  it('makes a concurrent uncertain delivery visible without replay', async () => {
    receiptRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ state: 'PROCESSING' });
    receiptRepository.insert.mockRejectedValue(new Error('duplicate receipt'));
    receiptRepository.update.mockResolvedValue({ affected: 1 });
    eventRepository.update.mockResolvedValue({ affected: 1 });

    await expect(
      service.consume({ outboxEventId: EVENT_ID, workspaceId: WORKSPACE_ID }),
    ).resolves.toEqual({ status: 'RECONCILIATION_REQUIRED' });

    expect(eventRepository.update).toHaveBeenCalledWith(
      WORKSPACE_ID,
      { id: EVENT_ID },
      expect.objectContaining({
        state: 'RECONCILIATION_REQUIRED',
        lastErrorCode: 'OUTBOX_CONSUMER_OUTCOME_UNCERTAIN',
      }),
    );
    expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
  });

  it('rejects a cross-workspace event reference before receipt creation', async () => {
    receiptRepository.findOne.mockResolvedValue(null);
    eventRepository.findOne.mockResolvedValue(null);

    await expect(
      service.consume({ outboxEventId: EVENT_ID, workspaceId: WORKSPACE_ID }),
    ).rejects.toThrow('invalid or foreign');

    expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
    expect(receiptRepository.findOne).not.toHaveBeenCalled();
    expect(receiptRepository.insert).not.toHaveBeenCalled();
  });

  it('rejects a payload whose persisted digest no longer matches', async () => {
    receiptRepository.findOne.mockResolvedValue(null);
    receiptRepository.insert.mockResolvedValue({ identifiers: [{}] });
    eventRepository.findOne.mockResolvedValue({
      id: EVENT_ID,
      workspaceId: WORKSPACE_ID,
      eventType: 'configuration.version.created',
      schemaVersion: 1,
      aggregateType: 'configurationVersion',
      aggregateId: 'version-id',
      payload: { secret: 'tampered' },
      payloadDigest: buildDeterministicDigest({}),
      rootCorrelationId: '33333333-3333-4333-8333-333333333333',
      state: 'PUBLISHED',
    });
    receiptRepository.update.mockResolvedValue({ affected: 1 });
    eventRepository.update.mockResolvedValue({ affected: 1 });

    await expect(
      service.consume({ outboxEventId: EVENT_ID, workspaceId: WORKSPACE_ID }),
    ).rejects.toThrow('invalid or foreign');

    expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
    expect(receiptRepository.insert).not.toHaveBeenCalled();
  });

  it('never retries automatically after a handler outcome becomes uncertain', async () => {
    receiptRepository.findOne.mockResolvedValue(null);
    receiptRepository.insert.mockResolvedValue({ identifiers: [{}] });
    eventRepository.findOne.mockResolvedValue({
      id: EVENT_ID,
      workspaceId: WORKSPACE_ID,
      eventType: 'configuration.version.created',
      schemaVersion: 1,
      aggregateType: 'configurationVersion',
      aggregateId: 'version-id',
      payload: {},
      payloadDigest: buildDeterministicDigest({}),
      rootCorrelationId: '33333333-3333-4333-8333-333333333333',
      state: 'PUBLISHED',
    });
    eventEmitter.emitAsync.mockRejectedValue(new Error('handler failed'));
    receiptRepository.update.mockResolvedValue({ affected: 1 });
    eventRepository.update.mockResolvedValue({ affected: 1 });

    await expect(
      service.consume({ outboxEventId: EVENT_ID, workspaceId: WORKSPACE_ID }),
    ).resolves.toEqual({ status: 'RECONCILIATION_REQUIRED' });

    expect(receiptRepository.update).toHaveBeenLastCalledWith(
      WORKSPACE_ID,
      expect.objectContaining({ outboxEventId: EVENT_ID }),
      expect.objectContaining({
        state: 'RECONCILIATION_REQUIRED',
        lastErrorCode: 'OUTBOX_CONSUMER_EFFECT_UNCERTAIN',
      }),
    );
    expect(eventRepository.update).toHaveBeenCalledWith(
      WORKSPACE_ID,
      { id: EVENT_ID },
      {
        state: 'RECONCILIATION_REQUIRED',
        lastErrorCode: 'OUTBOX_CONSUMER_EFFECT_UNCERTAIN',
      },
    );
  });
});
