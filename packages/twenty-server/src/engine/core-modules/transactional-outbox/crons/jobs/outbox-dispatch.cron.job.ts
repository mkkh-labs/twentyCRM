import { Injectable } from '@nestjs/common';

import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { OutboxDispatcherService } from 'src/engine/core-modules/transactional-outbox/services/outbox-dispatcher.service';

@Injectable()
@Processor(MessageQueue.cronQueue)
export class OutboxDispatchCronJob {
  constructor(private readonly dispatcher: OutboxDispatcherService) {}

  @Process(OutboxDispatchCronJob.name)
  async handle(): Promise<void> {
    await this.dispatcher.dispatchDue();
  }
}
