import { isPlainObject, isValidUuid } from 'twenty-shared/utils';

import { type OutboxEventDeliveryJobData } from 'src/engine/core-modules/transactional-outbox/types/outbox-event-delivery-job-data.type';

const DELIVERY_JOB_KEYS = new Set(['outboxEventId', 'workspaceId']);

export const validateOutboxEventDeliveryJobData = (
  value: unknown,
): value is OutboxEventDeliveryJobData =>
  isPlainObject(value) &&
  Object.keys(value).every((key) => DELIVERY_JOB_KEYS.has(key)) &&
  typeof value.outboxEventId === 'string' &&
  isValidUuid(value.outboxEventId) &&
  typeof value.workspaceId === 'string' &&
  isValidUuid(value.workspaceId);
