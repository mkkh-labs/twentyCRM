import { Injectable } from '@nestjs/common';

import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { OutboxRetentionService } from 'src/engine/core-modules/transactional-outbox/services/outbox-retention.service';

export type OutboxRetentionJobData = {
  workspaceId: string;
  eventLogRetentionDays: number;
};

@Injectable()
@Processor(MessageQueue.workspaceQueue)
export class OutboxRetentionJob {
  constructor(
    private readonly outboxRetentionService: OutboxRetentionService,
  ) {}

  @Process(OutboxRetentionJob.name)
  async handle(data: OutboxRetentionJobData): Promise<void> {
    await this.outboxRetentionService.cleanupWorkspace({
      workspaceId: data.workspaceId,
      retentionDays: data.eventLogRetentionDays,
    });
  }
}
