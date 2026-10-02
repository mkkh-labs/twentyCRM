import { type WorkflowProviderCapability } from 'src/engine/core-modules/workflow-reliability/types/workflow-provider-capability.type';

const CONSERVATIVE_SINGLE_ATTEMPT_PROVIDER_CLASSES = [
  'CreateCalendarEventWorkflowAction',
  'DraftEmailWorkflowAction',
  'HttpRequestWorkflowAction',
  'MessageCampaignEmail',
  'SendEmailWorkflowAction',
  'workflow-ai-agent',
  'workflow-code',
  'workflow-logic-function',
  'workflow-record-create_one',
  'workflow-record-delete_one',
  'workflow-record-update_one',
  'workflow-record-upsert_many',
] as const;

// Provider guarantees remain disabled until each integration has target evidence.
export const WORKFLOW_PROVIDER_CAPABILITIES = Object.freeze(
  CONSERVATIVE_SINGLE_ATTEMPT_PROVIDER_CLASSES.map((providerClass) =>
    Object.freeze({
      providerClass,
      supportsIdempotencyKey: false,
      supportsOutcomeReconciliation: false,
      maximumAutomaticAttempts: 1,
    } satisfies WorkflowProviderCapability),
  ),
);
