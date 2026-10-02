import { type OutboxEventEntity } from 'src/engine/core-modules/transactional-outbox/entities/outbox-event.entity';

export const OUTBOX_EVENT_PUBLISHER = Symbol('OUTBOX_EVENT_PUBLISHER');

export type OutboxEventPublisher = Readonly<{
  publish: (event: Readonly<OutboxEventEntity>) => Promise<void>;
}>;
