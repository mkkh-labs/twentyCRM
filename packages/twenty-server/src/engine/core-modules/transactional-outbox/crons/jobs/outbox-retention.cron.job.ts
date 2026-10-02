import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { WorkspaceActivationStatus } from 'twenty-shared/workspace';
import { type Repository } from 'typeorm';

import { SentryCronMonitor } from 'src/engine/core-modules/cron/sentry-cron-monitor.decorator';
import { ExceptionHandlerService } from 'src/engine/core-modules/exception-handler/exception-handler.service';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { OUTBOX_RETENTION_CRON_PATTERN } from 'src/engine/core-modules/transactional-outbox/constants/outbox-retention-cron-pattern.constant';
import {
  OutboxRetentionJob,
  type OutboxRetentionJobData,
} from 'src/engine/core-modules/transactional-outbox/jobs/outbox-retention.job';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';

@Injectable()
@Processor(MessageQueue.cronQueue)
export class OutboxRetentionCronJob {
  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    @InjectMessageQueue(MessageQueue.workspaceQueue)
    private readonly messageQueueService: MessageQueueService,
    private readonly exceptionHandlerService: ExceptionHandlerService,
  ) {}

  @Process(OutboxRetentionCronJob.name)
  @SentryCronMonitor(OutboxRetentionCronJob.name, OUTBOX_RETENTION_CRON_PATTERN)
  async handle(): Promise<void> {
    const workspaces = await this.workspaceRepository.find({
      where: { activationStatus: WorkspaceActivationStatus.ACTIVE },
      select: ['id', 'eventLogRetentionDays'],
      order: { id: 'ASC' },
    });

    for (const workspace of workspaces) {
      try {
        await this.messageQueueService.add<OutboxRetentionJobData>(
          OutboxRetentionJob.name,
          {
            workspaceId: workspace.id,
            eventLogRetentionDays: workspace.eventLogRetentionDays,
          },
        );
      } catch (error) {
        this.exceptionHandlerService.captureExceptions([error], {
          workspace: { id: workspace.id },
        });
      }
    }
  }
}
