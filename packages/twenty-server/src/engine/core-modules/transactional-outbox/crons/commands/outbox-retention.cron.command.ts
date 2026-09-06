import { Command, CommandRunner } from 'nest-commander';

import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { OUTBOX_RETENTION_CRON_PATTERN } from 'src/engine/core-modules/transactional-outbox/constants/outbox-retention-cron-pattern.constant';
import { OutboxRetentionCronJob } from 'src/engine/core-modules/transactional-outbox/crons/jobs/outbox-retention.cron.job';

@Command({
  name: 'cron:outbox:retention',
  description: 'Registers workspace-scoped transactional outbox retention',
})
export class OutboxRetentionCronCommand extends CommandRunner {
  constructor(
    @InjectMessageQueue(MessageQueue.cronQueue)
    private readonly queue: MessageQueueService,
  ) {
    super();
  }

  async run(): Promise<void> {
    await this.queue.addCron<undefined>({
      jobName: OutboxRetentionCronJob.name,
      data: undefined,
      options: { repeat: { pattern: OUTBOX_RETENTION_CRON_PATTERN } },
    });
  }
}
