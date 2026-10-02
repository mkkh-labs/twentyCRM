import { isPlainObject, isValidUuid } from 'twenty-shared/utils';

import { type WorkflowTriggerJobData } from 'src/modules/workflow/workflow-trigger/types/workflow-trigger-job-data.type';
import { validateWorkflowDatabaseEventReference } from 'src/modules/workflow/workflow-trigger/utils/validate-workflow-database-event-reference.util';

const CRON_JOB_KEYS = new Set([
  'triggerType',
  'workspaceId',
  'workflowId',
  'payload',
  'rootCorrelationId',
]);
const DATABASE_EVENT_JOB_KEYS = new Set([
  'triggerType',
  'workspaceId',
  'workflowId',
  'databaseEvent',
]);

const hasOnlyKeys = (value: Record<string, unknown>, keys: Set<string>) =>
  Object.keys(value).every((key) => keys.has(key));

export const validateWorkflowTriggerJobData = (
  value: unknown,
): value is WorkflowTriggerJobData => {
  if (
    !isPlainObject(value) ||
    typeof value.workspaceId !== 'string' ||
    !isValidUuid(value.workspaceId) ||
    typeof value.workflowId !== 'string' ||
    !isValidUuid(value.workflowId)
  ) {
    return false;
  }

  if (value.triggerType === 'cron') {
    return (
      hasOnlyKeys(value, CRON_JOB_KEYS) &&
      isPlainObject(value.payload) &&
      Object.keys(value.payload).length === 0 &&
      typeof value.rootCorrelationId === 'string' &&
      isValidUuid(value.rootCorrelationId)
    );
  }

  if (value.triggerType === 'database-event') {
    return (
      hasOnlyKeys(value, DATABASE_EVENT_JOB_KEYS) &&
      validateWorkflowDatabaseEventReference(
        value.databaseEvent,
        value.workspaceId,
        value.workflowId,
      )
    );
  }

  return false;
};
