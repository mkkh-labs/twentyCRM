import { isPlainObject, isValidUuid } from 'twenty-shared/utils';

import { DatabaseEventAction } from 'src/engine/api/graphql/graphql-query-runner/enums/database-event-action';
import { buildDeterministicDigest } from 'src/engine/core-modules/policy/utils/build-deterministic-digest.util';
import { type WorkflowDatabaseEventReference } from 'src/modules/workflow/workflow-trigger/types/workflow-trigger-job-data.type';

const SHA_256_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{0,127}$/;
const REFERENCE_KEYS = new Set([
  'schemaVersion',
  'provenance',
  'policyVersion',
  'workspaceId',
  'workflowId',
  'workflowVersionId',
  'triggerConfigurationDigest',
  'objectMetadataId',
  'objectNameSingular',
  'action',
  'recordId',
  'updatedFields',
  'sourceEventDigest',
  'idempotencyKey',
  'rootCorrelationId',
  'createdAt',
  'expiresAt',
  'signatureVersion',
  'signatureKeyId',
  'signature',
  'payloadDigest',
]);

export const validateWorkflowDatabaseEventReference = (
  value: unknown,
  expectedWorkspaceId: string,
  expectedWorkflowId: string,
  now = new Date(),
): value is WorkflowDatabaseEventReference => {
  if (
    !isPlainObject(value) ||
    Object.keys(value).some((key) => !REFERENCE_KEYS.has(key)) ||
    value.schemaVersion !== 1 ||
    value.provenance !== 'WORKSPACE_DATABASE_EVENT' ||
    value.policyVersion !== 'p0-v1' ||
    value.workspaceId !== expectedWorkspaceId ||
    value.workflowId !== expectedWorkflowId ||
    typeof value.workspaceId !== 'string' ||
    !isValidUuid(value.workspaceId) ||
    typeof value.workflowId !== 'string' ||
    !isValidUuid(value.workflowId) ||
    typeof value.workflowVersionId !== 'string' ||
    !isValidUuid(value.workflowVersionId) ||
    typeof value.triggerConfigurationDigest !== 'string' ||
    !SHA_256_PATTERN.test(value.triggerConfigurationDigest) ||
    typeof value.objectMetadataId !== 'string' ||
    !isValidUuid(value.objectMetadataId) ||
    typeof value.recordId !== 'string' ||
    !isValidUuid(value.recordId) ||
    typeof value.rootCorrelationId !== 'string' ||
    !isValidUuid(value.rootCorrelationId) ||
    typeof value.objectNameSingular !== 'string' ||
    !SAFE_NAME_PATTERN.test(value.objectNameSingular) ||
    !Object.values(DatabaseEventAction).includes(
      value.action as DatabaseEventAction,
    ) ||
    !Array.isArray(value.updatedFields) ||
    value.updatedFields.length > 1_000 ||
    !value.updatedFields.every(
      (field) => typeof field === 'string' && SAFE_NAME_PATTERN.test(field),
    ) ||
    typeof value.sourceEventDigest !== 'string' ||
    !SHA_256_PATTERN.test(value.sourceEventDigest) ||
    typeof value.idempotencyKey !== 'string' ||
    !SHA_256_PATTERN.test(value.idempotencyKey) ||
    typeof value.payloadDigest !== 'string' ||
    !SHA_256_PATTERN.test(value.payloadDigest) ||
    value.signatureVersion !== 1 ||
    typeof value.signatureKeyId !== 'string' ||
    !SHA_256_PATTERN.test(value.signatureKeyId) ||
    typeof value.signature !== 'string' ||
    !SHA_256_PATTERN.test(value.signature) ||
    typeof value.createdAt !== 'string' ||
    typeof value.expiresAt !== 'string' ||
    Number.isNaN(Date.parse(value.createdAt)) ||
    Number.isNaN(Date.parse(value.expiresAt)) ||
    Date.parse(value.expiresAt) <= now.getTime()
  ) {
    return false;
  }

  const { payloadDigest, ...referenceWithoutDigest } = value;

  const expectedIdempotencyKey = buildDeterministicDigest({
    schemaVersion: value.schemaVersion,
    workspaceId: value.workspaceId,
    workflowId: value.workflowId,
    workflowVersionId: value.workflowVersionId,
    triggerConfigurationDigest: value.triggerConfigurationDigest,
    objectMetadataId: value.objectMetadataId,
    objectNameSingular: value.objectNameSingular,
    action: value.action,
    sourceEventDigest: value.sourceEventDigest,
  });

  return (
    expectedIdempotencyKey === value.idempotencyKey &&
    buildDeterministicDigest(referenceWithoutDigest) === payloadDigest
  );
};
