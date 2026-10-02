import { Injectable } from '@nestjs/common';

import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { OutboxEventConsumerService } from 'src/engine/core-modules/transactional-outbox/services/outbox-event-consumer.service';
import { type OutboxEventDeliveryJobData } from 'src/engine/core-modules/transactional-outbox/types/outbox-event-delivery-job-data.type';
import { validateOutboxEventDeliveryJobData } from 'src/engine/core-modules/transactional-outbox/utils/validate-outbox-event-delivery-job-data.util';

@Injectable()
@Processor(MessageQueue.outboxQueue)
export class OutboxEventDeliveryJob {
  constructor(private readonly consumer: OutboxEventConsumerService) {}

  @Process(OutboxEventDeliveryJob.name)
  async handle(data: OutboxEventDeliveryJobData): Promise<void> {
    if (!validateOutboxEventDeliveryJobData(data)) {
      throw new Error('Outbox delivery job data is invalid.');
    }

    await this.consumer.consume(data);
  }
}
