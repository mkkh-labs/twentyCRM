import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OutboxDispatchCronCommand } from 'src/engine/core-modules/transactional-outbox/crons/commands/outbox-dispatch.cron.command';
import { OutboxRetentionCronCommand } from 'src/engine/core-modules/transactional-outbox/crons/commands/outbox-retention.cron.command';
import { OutboxDispatchCronJob } from 'src/engine/core-modules/transactional-outbox/crons/jobs/outbox-dispatch.cron.job';
import { OutboxRetentionCronJob } from 'src/engine/core-modules/transactional-outbox/crons/jobs/outbox-retention.cron.job';
import { OutboxConsumerReceiptEntity } from 'src/engine/core-modules/transactional-outbox/entities/outbox-consumer-receipt.entity';
import { OutboxEventEntity } from 'src/engine/core-modules/transactional-outbox/entities/outbox-event.entity';
import { OutboxEventDeliveryJob } from 'src/engine/core-modules/transactional-outbox/jobs/outbox-event-delivery.job';
import { OutboxRetentionJob } from 'src/engine/core-modules/transactional-outbox/jobs/outbox-retention.job';
import { OutboxEventConsumerService } from 'src/engine/core-modules/transactional-outbox/services/outbox-event-consumer.service';
import { OutboxDispatcherService } from 'src/engine/core-modules/transactional-outbox/services/outbox-dispatcher.service';
import { OUTBOX_EVENT_PUBLISHER } from 'src/engine/core-modules/transactional-outbox/services/outbox-event-publisher';
import { OutboxQueuePublisherService } from 'src/engine/core-modules/transactional-outbox/services/outbox-queue-publisher.service';
import { OutboxRetentionService } from 'src/engine/core-modules/transactional-outbox/services/outbox-retention.service';
import { TransactionalOutboxService } from 'src/engine/core-modules/transactional-outbox/services/transactional-outbox.service';
import { OutboxOperationsService } from 'src/engine/core-modules/transactional-outbox/services/outbox-operations.service';
import { OutboxOperationsResolver } from 'src/engine/core-modules/transactional-outbox/resolvers/outbox-operations.resolver';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { provideWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/provide-workspace-scoped-repository';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';

@Module({
  imports: [
    PermissionsModule,
    TypeOrmModule.forFeature([
      OutboxEventEntity,
      OutboxConsumerReceiptEntity,
      WorkspaceEntity,
    ]),
  ],
  providers: [
    TransactionalOutboxService,
    OutboxDispatcherService,
    OutboxEventConsumerService,
    OutboxEventDeliveryJob,
    OutboxDispatchCronCommand,
    OutboxDispatchCronJob,
    OutboxRetentionService,
    OutboxRetentionJob,
    OutboxRetentionCronCommand,
    OutboxRetentionCronJob,
    OutboxQueuePublisherService,
    OutboxOperationsService,
    OutboxOperationsResolver,
    provideWorkspaceScopedRepository(OutboxEventEntity),
    provideWorkspaceScopedRepository(OutboxConsumerReceiptEntity),
    {
      provide: OUTBOX_EVENT_PUBLISHER,
      useExisting: OutboxQueuePublisherService,
    },
  ],
  exports: [
    TransactionalOutboxService,
    OutboxDispatcherService,
    OutboxDispatchCronCommand,
    OutboxRetentionCronCommand,
    OUTBOX_EVENT_PUBLISHER,
  ],
})
export class TransactionalOutboxModule {}
