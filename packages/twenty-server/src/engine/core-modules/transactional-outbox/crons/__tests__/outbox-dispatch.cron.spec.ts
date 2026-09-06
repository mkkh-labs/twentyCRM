import { OutboxDispatchCronCommand } from 'src/engine/core-modules/transactional-outbox/crons/commands/outbox-dispatch.cron.command';
import { OutboxDispatchCronJob } from 'src/engine/core-modules/transactional-outbox/crons/jobs/outbox-dispatch.cron.job';

describe('outbox dispatch cron', () => {
  it('registers the dispatcher on the cron queue', async () => {
    const addCron = jest.fn();
    const command = new OutboxDispatchCronCommand({ addCron } as never);

    await command.run();

    expect(addCron).toHaveBeenCalledWith({
      jobName: OutboxDispatchCronJob.name,
      data: undefined,
      options: { repeat: { every: 5000 } },
    });
  });

  it('dispatches due events when the cron fires', async () => {
    const dispatchDue = jest.fn().mockResolvedValue({ published: 1 });
    const job = new OutboxDispatchCronJob({ dispatchDue } as never);

    await job.handle();

    expect(dispatchDue).toHaveBeenCalledTimes(1);
  });
});
