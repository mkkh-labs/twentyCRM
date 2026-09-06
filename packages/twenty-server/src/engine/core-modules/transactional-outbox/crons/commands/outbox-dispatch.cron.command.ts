import { Command, CommandRunner } from 'nest-commander';

import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { OUTBOX_DISPATCH_CRON_INTERVAL_MILLISECONDS } from 'src/engine/core-modules/transactional-outbox/constants/outbox-dispatch-cron-interval.constant';
import { OutboxDispatchCronJob } from 'src/engine/core-modules/transactional-outbox/crons/jobs/outbox-dispatch.cron.job';

@Command({
  name: 'cron:outbox:dispatch',
  description: 'Registers durable transactional outbox dispatch',
})
export class OutboxDispatchCronCommand extends CommandRunner {
  constructor(
    @InjectMessageQueue(MessageQueue.cronQueue)
    private readonly queue: MessageQueueService,
  ) {
    super();
  }

  async run(): Promise<void> {
    await this.queue.addCron<undefined>({
      jobName: OutboxDispatchCronJob.name,
      data: undefined,
      options: {
        repeat: { every: OUTBOX_DISPATCH_CRON_INTERVAL_MILLISECONDS },
      },
    });
  }
}
