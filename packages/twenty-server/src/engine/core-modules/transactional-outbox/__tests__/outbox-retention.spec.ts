import { OutboxRetentionCronCommand } from 'src/engine/core-modules/transactional-outbox/crons/commands/outbox-retention.cron.command';
import { OutboxRetentionCronJob } from 'src/engine/core-modules/transactional-outbox/crons/jobs/outbox-retention.cron.job';
import { OutboxRetentionJob } from 'src/engine/core-modules/transactional-outbox/jobs/outbox-retention.job';
import { OutboxRetentionService } from 'src/engine/core-modules/transactional-outbox/services/outbox-retention.service';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';

describe('outbox retention', () => {
  it('deletes only published events older than the workspace retention cutoff', async () => {
    const eventRepository = {
      delete: jest.fn().mockResolvedValue({ affected: 2 }),
      find: jest.fn().mockResolvedValue([{ id: 'event-1' }]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const receiptRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ state: 'COMPLETED' }),
      update: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    const service = new OutboxRetentionService(
      eventRepository as never,
      receiptRepository as never,
    );

    await expect(
      service.cleanupWorkspace({
        workspaceId: WORKSPACE_ID,
        retentionDays: 90,
      }),
    ).resolves.toEqual({ deleted: 2, reconciliationRequired: 0 });

    expect(eventRepository.delete).toHaveBeenCalledWith(
      WORKSPACE_ID,
      expect.objectContaining({
        state: 'PUBLISHED',
        publishedAt: expect.objectContaining({ _type: 'lessThan' }),
      }),
    );
  });

  it.each([0, 29, 1096])(
    'rejects retention outside the audited range: %s',
    async (retentionDays) => {
      const repository = { delete: jest.fn() };
      const service = new OutboxRetentionService(
        repository as never,
        {} as never,
      );

      await expect(
        service.cleanupWorkspace({
          workspaceId: WORKSPACE_ID,
          retentionDays,
        }),
      ).rejects.toThrow('Outbox retention must be between 30 and 1095 days');
      expect(repository.delete).not.toHaveBeenCalled();
    },
  );

  it('moves stale processing receipts and their events to reconciliation', async () => {
    const eventRepository = {
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const receiptRepository = {
      find: jest
        .fn()
        .mockResolvedValue([
          { outboxEventId: 'event-1' },
          { outboxEventId: 'event-2' },
        ]),
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const service = new OutboxRetentionService(
      eventRepository as never,
      receiptRepository as never,
    );

    await expect(
      service.cleanupWorkspace({
        workspaceId: WORKSPACE_ID,
        retentionDays: 90,
      }),
    ).resolves.toEqual({ deleted: 0, reconciliationRequired: 2 });

    expect(receiptRepository.find).toHaveBeenCalledWith(
      WORKSPACE_ID,
      expect.objectContaining({
        where: expect.objectContaining({
          state: 'PROCESSING',
          updatedAt: expect.objectContaining({ _type: 'lessThan' }),
        }),
      }),
    );
    expect(eventRepository.update).toHaveBeenCalledTimes(2);
    expect(eventRepository.update).toHaveBeenCalledWith(
      WORKSPACE_ID,
      { id: 'event-1' },
      {
        state: 'RECONCILIATION_REQUIRED',
        lastErrorCode: 'OUTBOX_CONSUMER_PROCESSING_LEASE_EXPIRED',
      },
    );
  });

  it('retains a published event until its required consumer completed', async () => {
    const eventRepository = {
      delete: jest.fn(),
      find: jest.fn().mockResolvedValue([{ id: 'event-1' }]),
      update: jest.fn(),
    };
    const receiptRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    };
    const service = new OutboxRetentionService(
      eventRepository as never,
      receiptRepository as never,
    );

    await expect(
      service.cleanupWorkspace({
        workspaceId: WORKSPACE_ID,
        retentionDays: 90,
      }),
    ).resolves.toEqual({ deleted: 0, reconciliationRequired: 0 });

    expect(eventRepository.delete).not.toHaveBeenCalled();
  });

  it('runs cleanup as a workspace-scoped job', async () => {
    const cleanupWorkspace = jest.fn().mockResolvedValue({
      deleted: 1,
      reconciliationRequired: 0,
    });
    const job = new OutboxRetentionJob({ cleanupWorkspace } as never);

    await job.handle({
      workspaceId: WORKSPACE_ID,
      eventLogRetentionDays: 90,
    });

    expect(cleanupWorkspace).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      retentionDays: 90,
    });
  });

  it('enqueues retention for every active workspace with its configured retention', async () => {
    const workspaceRepository = {
      find: jest.fn().mockResolvedValue([
        { id: WORKSPACE_ID, eventLogRetentionDays: 90 },
        {
          id: '22222222-2222-4222-8222-222222222222',
          eventLogRetentionDays: 365,
        },
      ]),
    };
    const add = jest.fn().mockResolvedValue(undefined);
    const cronJob = new OutboxRetentionCronJob(
      workspaceRepository as never,
      { add } as never,
      { captureExceptions: jest.fn() } as never,
    );

    await cronJob.handle();

    expect(add).toHaveBeenCalledTimes(2);
    expect(add).toHaveBeenNthCalledWith(1, OutboxRetentionJob.name, {
      workspaceId: WORKSPACE_ID,
      eventLogRetentionDays: 90,
    });
    expect(workspaceRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({ select: ['id', 'eventLogRetentionDays'] }),
    );
  });

  it('registers the daily retention cron', async () => {
    const addCron = jest.fn().mockResolvedValue(undefined);
    const command = new OutboxRetentionCronCommand({ addCron } as never);

    await command.run();

    expect(addCron).toHaveBeenCalledWith({
      jobName: OutboxRetentionCronJob.name,
      data: undefined,
      options: { repeat: { pattern: '30 3 * * *' } },
    });
  });
});
