import { isPlainObject, isValidUuid } from 'twenty-shared/utils';

import { type PolicyAuditMetadata } from 'src/engine/core-modules/policy/types/policy-audit-metadata.type';

const MAX_TARGET_COUNT = 1_000_000;
const MAX_PAYLOAD_SCHEMA_VERSION = 100;
const SHA_256_PATTERN = /^[a-f0-9]{64}$/;
const PROVIDER_CLASS_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

const ALLOWED_METADATA_KEYS = new Set([
  'targetCount',
  'argumentDigest',
  'idempotencyKeyDigest',
  'providerClass',
  'providerReferenceDigest',
  'correlationSource',
  'workflowVersionId',
  'replayOfAttemptId',
  'payloadSchemaVersion',
  'payloadDigest',
  'payloadClassification',
  'approvalId',
]);

export type PolicyAuditMetadataValidation =
  | Readonly<{ valid: true; metadata: PolicyAuditMetadata }>
  | Readonly<{
      valid: false;
      reason: 'INVALID_VALUE' | 'MALFORMED' | 'UNKNOWN_KEY';
      field?: string;
    }>;

const isSha256 = (value: unknown): value is string =>
  typeof value === 'string' && SHA_256_PATTERN.test(value);

export const validatePolicyAuditMetadata = (
  candidate: unknown,
): PolicyAuditMetadataValidation => {
  if (!isPlainObject(candidate)) {
    return { valid: false, reason: 'MALFORMED' };
  }

  const unknownKey = Object.keys(candidate).find(
    (key) => !ALLOWED_METADATA_KEYS.has(key),
  );

  if (unknownKey !== undefined) {
    return { valid: false, reason: 'UNKNOWN_KEY', field: unknownKey };
  }

  const validators: Partial<
    Record<keyof PolicyAuditMetadata, (value: unknown) => boolean>
  > = {
    targetCount: (value) =>
      Number.isInteger(value) &&
      Number(value) >= 0 &&
      Number(value) <= MAX_TARGET_COUNT,
    argumentDigest: isSha256,
    idempotencyKeyDigest: isSha256,
    providerClass: (value) =>
      typeof value === 'string' && PROVIDER_CLASS_PATTERN.test(value),
    providerReferenceDigest: isSha256,
    correlationSource: (value) =>
      value === 'SERVER_GENERATED' || value === 'LEGACY_WORKFLOW_RUN_ID',
    workflowVersionId: (value) =>
      typeof value === 'string' && isValidUuid(value),
    replayOfAttemptId: (value) =>
      typeof value === 'string' && isValidUuid(value),
    payloadSchemaVersion: (value) =>
      Number.isInteger(value) &&
      Number(value) > 0 &&
      Number(value) <= MAX_PAYLOAD_SCHEMA_VERSION,
    payloadDigest: isSha256,
    payloadClassification: (value) =>
      value === 'CONTROL' || value === 'BUSINESS_RESTRICTED',
    approvalId: (value) => typeof value === 'string' && isValidUuid(value),
  };

  for (const [key, value] of Object.entries(candidate)) {
    const validator = validators[key as keyof PolicyAuditMetadata];

    if (validator === undefined || !validator(value)) {
      return { valid: false, reason: 'INVALID_VALUE', field: key };
    }
  }

  return {
    valid: true,
    metadata: candidate as PolicyAuditMetadata,
  };
};
