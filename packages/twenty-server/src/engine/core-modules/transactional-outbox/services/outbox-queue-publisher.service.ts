import { Injectable } from '@nestjs/common';

import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { OutboxEventDeliveryJob } from 'src/engine/core-modules/transactional-outbox/jobs/outbox-event-delivery.job';
import { type OutboxEventPublisher } from 'src/engine/core-modules/transactional-outbox/services/outbox-event-publisher';

@Injectable()
export class OutboxQueuePublisherService implements OutboxEventPublisher {
  constructor(
    @InjectMessageQueue(MessageQueue.outboxQueue)
    private readonly queue: MessageQueueService,
  ) {}

  publish(event: Parameters<OutboxEventPublisher['publish']>[0]) {
    return this.queue.add(
      OutboxEventDeliveryJob.name,
      { outboxEventId: event.id, workspaceId: event.workspaceId },
      { id: `outbox-event-${event.id}`, retryLimit: 0 },
    );
  }
}
