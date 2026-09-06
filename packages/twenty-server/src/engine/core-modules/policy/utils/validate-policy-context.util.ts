import {
  isNonEmptyArray,
  isPlainObject,
  isValidUuid,
} from 'twenty-shared/utils';
import { isNonEmptyString } from '@sniptt/guards';

import { type PolicyContext } from 'src/engine/core-modules/policy/types/policy-context.type';
import { type PolicyDecisionReasonCode } from 'src/engine/core-modules/policy/types/policy-decision.type';

const MAX_IDENTIFIER_COUNT = 1_000;
const MAX_OPERATION_LENGTH = 128;
const MAX_BOUND_STRING_LENGTH = 256;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const TRACE_ID_PATTERN = /^[a-f0-9]{32}$/i;
const SAFE_BOUND_STRING_PATTERN = /^[a-zA-Z0-9:._/-]+$/;

const CONTEXT_KEYS = new Set([
  'schemaVersion',
  'policyVersion',
  'workspaceId',
  'actor',
  'authority',
  'operation',
  'riskClass',
  'target',
  'affectedFieldMetadataIds',
  'correlation',
]);
const ACTOR_COMMON_KEYS = ['type', 'id', 'workspaceId'];
const AUTHORITY_COMMON_KEYS = [
  'type',
  'source',
  'workspaceId',
  'authorityVersion',
  'revocationState',
  'evaluatedAt',
];
const TARGET_KEYS = new Set([
  'workspaceId',
  'resourceType',
  'resourceId',
  'objectMetadataId',
  'recordIds',
  'fieldMetadataIds',
]);
const CORRELATION_KEYS = new Set([
  'rootCorrelationId',
  'decisionId',
  'attemptId',
  'traceId',
  'jobId',
  'workflowRunId',
  'mutationOrEffectId',
]);

export type PolicyContextValidation =
  | Readonly<{ valid: true; context: PolicyContext }>
  | Readonly<{
      valid: false;
      reason: Extract<
        PolicyDecisionReasonCode,
        | 'AUTHORITY_REVOKED'
        | 'AUTHORITY_UNRESOLVED'
        | 'BYPASS_AUTHORITY_FORBIDDEN'
        | 'IDENTITY_MISSING'
        | 'POLICY_CONTEXT_MALFORMED'
        | 'POLICY_CONTEXT_MISMATCH'
        | 'POLICY_VERSION_UNSUPPORTED'
        | 'SERVICE_OPERATION_FORBIDDEN'
        | 'SERVICE_RISK_FORBIDDEN'
        | 'TENANT_CONTEXT_MISSING'
      >;
      safeDetails?: Readonly<{ field: string; classification: string }>;
    }>;

const deny = (
  reason: Exclude<PolicyContextValidation, { valid: true }>['reason'],
  field?: string,
): PolicyContextValidation => ({
  valid: false,
  reason,
  ...(field === undefined
    ? {}
    : { safeDetails: { field, classification: 'INVALID_POLICY_CONTEXT' } }),
});

const hasOnlyKeys = (
  value: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
): boolean => Object.keys(value).every((key) => allowedKeys.has(key));

const isBoundedString = (
  value: unknown,
  maximumLength: number,
): value is string => isNonEmptyString(value) && value.length <= maximumLength;

const isBoundedSafeString = (value: unknown): value is string =>
  isBoundedString(value, MAX_BOUND_STRING_LENGTH) &&
  SAFE_BOUND_STRING_PATTERN.test(value);

const isUuidArray = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length <= MAX_IDENTIFIER_COUNT &&
  value.every((entry) => typeof entry === 'string' && isValidUuid(entry)) &&
  new Set(value).size === value.length;

const isValidDate = (value: unknown): value is string =>
  typeof value === 'string' &&
  ISO_DATE_PATTERN.test(value) &&
  !Number.isNaN(Date.parse(value));

const validateActor = (
  actor: unknown,
  workspaceId: string,
): PolicyContextValidation | null => {
  if (!isPlainObject(actor) || typeof actor.type !== 'string') {
    return deny('IDENTITY_MISSING', 'actor');
  }

  if (actor.workspaceId !== workspaceId) {
    return deny('POLICY_CONTEXT_MISMATCH', 'actor.workspaceId');
  }

  if (actor.type === 'user') {
    if (
      !hasOnlyKeys(
        actor,
        new Set([...ACTOR_COMMON_KEYS, 'workspaceMemberId', 'applicationId']),
      ) ||
      !isBoundedString(actor.id, MAX_BOUND_STRING_LENGTH) ||
      !isValidUuid(actor.id) ||
      !isBoundedString(actor.workspaceMemberId, MAX_BOUND_STRING_LENGTH) ||
      !isValidUuid(actor.workspaceMemberId) ||
      (actor.applicationId !== undefined &&
        (typeof actor.applicationId !== 'string' ||
          !isValidUuid(actor.applicationId)))
    ) {
      return deny('IDENTITY_MISSING', 'actor');
    }

    return null;
  }

  if (actor.type === 'apiKey' || actor.type === 'application') {
    if (
      !hasOnlyKeys(actor, new Set(ACTOR_COMMON_KEYS)) ||
      !isBoundedString(actor.id, MAX_BOUND_STRING_LENGTH) ||
      !isValidUuid(actor.id)
    ) {
      return deny('IDENTITY_MISSING', 'actor');
    }

    return null;
  }

  if (actor.type === 'system') {
    if (
      !hasOnlyKeys(
        actor,
        new Set([...ACTOR_COMMON_KEYS, 'serviceAuthorityId']),
      ) ||
      actor.id !== null ||
      !isBoundedSafeString(actor.serviceAuthorityId)
    ) {
      return deny('IDENTITY_MISSING', 'actor');
    }

    return null;
  }

  return deny('IDENTITY_MISSING', 'actor.type');
};

const validateRolePermissionConfig = (
  rolePermissionConfig: unknown,
): PolicyContextValidation | null => {
  if (!isPlainObject(rolePermissionConfig)) {
    return deny('AUTHORITY_UNRESOLVED', 'authority.rolePermissionConfig');
  }

  if (
    rolePermissionConfig.shouldBypassPermissionChecks === true ||
    'shouldBypassPermissionChecks' in rolePermissionConfig
  ) {
    return deny('BYPASS_AUTHORITY_FORBIDDEN', 'authority.rolePermissionConfig');
  }

  const keys = Object.keys(rolePermissionConfig);

  if (keys.length !== 1) {
    return deny('AUTHORITY_UNRESOLVED', 'authority.rolePermissionConfig');
  }

  const roleIds =
    'unionOf' in rolePermissionConfig
      ? rolePermissionConfig.unionOf
      : rolePermissionConfig.intersectionOf;

  if (
    !Array.isArray(roleIds) ||
    !isNonEmptyArray(roleIds) ||
    !isUuidArray(roleIds)
  ) {
    return deny('AUTHORITY_UNRESOLVED', 'authority.rolePermissionConfig');
  }

  return null;
};

const validateAuthority = (
  authority: unknown,
  actor: Record<string, unknown>,
  workspaceId: string,
  operation: string,
  riskClass: unknown,
): PolicyContextValidation | null => {
  if (!isPlainObject(authority) || typeof authority.type !== 'string') {
    return deny('AUTHORITY_UNRESOLVED', 'authority');
  }

  if (authority.workspaceId !== workspaceId) {
    return deny('POLICY_CONTEXT_MISMATCH', 'authority.workspaceId');
  }

  if (authority.revocationState !== 'ACTIVE') {
    return authority.revocationState === 'REVOKED'
      ? deny('AUTHORITY_REVOKED', 'authority.revocationState')
      : deny('AUTHORITY_UNRESOLVED', 'authority.revocationState');
  }

  if (
    !isBoundedSafeString(authority.authorityVersion) ||
    !isValidDate(authority.evaluatedAt)
  ) {
    return deny('POLICY_CONTEXT_MALFORMED', 'authority');
  }

  if (authority.type === 'roles') {
    if (
      !hasOnlyKeys(
        authority,
        new Set([...AUTHORITY_COMMON_KEYS, 'rolePermissionConfig']),
      ) ||
      ![
        'CALLER_BOUND',
        'DELEGATED_APPLICATION',
        'LEGACY_RECONSTRUCTED',
      ].includes(String(authority.source)) ||
      actor.type === 'system'
    ) {
      return deny('POLICY_CONTEXT_MISMATCH', 'authority');
    }

    return validateRolePermissionConfig(authority.rolePermissionConfig);
  }

  if (authority.type === 'service' || authority.type === 'serviceMutation') {
    const maximumRiskClass = authority.type === 'service' ? 'R0' : 'R1';

    if (
      !hasOnlyKeys(
        authority,
        new Set([
          ...AUTHORITY_COMMON_KEYS,
          'serviceAuthorityId',
          'allowedOperations',
          'maximumRiskClass',
        ]),
      ) ||
      authority.source !== 'SCOPED_SERVICE_PRINCIPAL' ||
      actor.type !== 'system' ||
      authority.maximumRiskClass !== maximumRiskClass ||
      !isBoundedSafeString(authority.serviceAuthorityId) ||
      authority.serviceAuthorityId !== actor.serviceAuthorityId ||
      !Array.isArray(authority.allowedOperations) ||
      !isNonEmptyArray(authority.allowedOperations) ||
      authority.allowedOperations.length > MAX_IDENTIFIER_COUNT ||
      !authority.allowedOperations.every((entry) =>
        isBoundedString(entry, MAX_OPERATION_LENGTH),
      )
    ) {
      return deny('POLICY_CONTEXT_MISMATCH', 'authority');
    }

    if (
      (authority.type === 'service' && riskClass !== 'R0') ||
      (authority.type === 'serviceMutation' &&
        riskClass !== 'R0' &&
        riskClass !== 'R1')
    ) {
      return deny('SERVICE_RISK_FORBIDDEN', 'riskClass');
    }

    if (!authority.allowedOperations.includes(operation)) {
      return deny('SERVICE_OPERATION_FORBIDDEN', 'operation');
    }

    return null;
  }

  return deny('AUTHORITY_UNRESOLVED', 'authority.type');
};

const validateTarget = (
  target: unknown,
  workspaceId: string,
): PolicyContextValidation | null => {
  if (!isPlainObject(target) || !hasOnlyKeys(target, TARGET_KEYS)) {
    return deny('POLICY_CONTEXT_MALFORMED', 'target');
  }

  if (target.workspaceId !== workspaceId) {
    return deny('POLICY_CONTEXT_MISMATCH', 'target.workspaceId');
  }

  if (!isBoundedSafeString(target.resourceType)) {
    return deny('POLICY_CONTEXT_MALFORMED', 'target.resourceType');
  }

  if (
    (target.resourceId !== undefined &&
      !isBoundedString(target.resourceId, MAX_BOUND_STRING_LENGTH)) ||
    (target.objectMetadataId !== undefined &&
      (typeof target.objectMetadataId !== 'string' ||
        !isValidUuid(target.objectMetadataId))) ||
    (target.recordIds !== undefined && !isUuidArray(target.recordIds)) ||
    (target.fieldMetadataIds !== undefined &&
      !isUuidArray(target.fieldMetadataIds))
  ) {
    return deny('POLICY_CONTEXT_MALFORMED', 'target');
  }

  return null;
};

const validateCorrelation = (
  correlation: unknown,
): PolicyContextValidation | null => {
  if (
    !isPlainObject(correlation) ||
    !hasOnlyKeys(correlation, CORRELATION_KEYS)
  ) {
    return deny('POLICY_CONTEXT_MALFORMED', 'correlation');
  }

  for (const requiredId of [
    'rootCorrelationId',
    'decisionId',
    'attemptId',
  ] as const) {
    if (
      typeof correlation[requiredId] !== 'string' ||
      !isValidUuid(correlation[requiredId])
    ) {
      return deny('POLICY_CONTEXT_MALFORMED', `correlation.${requiredId}`);
    }
  }

  for (const optionalUuid of ['workflowRunId', 'mutationOrEffectId'] as const) {
    const value = correlation[optionalUuid];

    if (
      value !== undefined &&
      (typeof value !== 'string' || !isValidUuid(value))
    ) {
      return deny('POLICY_CONTEXT_MALFORMED', `correlation.${optionalUuid}`);
    }
  }

  if (
    (correlation.traceId !== undefined &&
      (typeof correlation.traceId !== 'string' ||
        !TRACE_ID_PATTERN.test(correlation.traceId))) ||
    (correlation.jobId !== undefined && !isBoundedSafeString(correlation.jobId))
  ) {
    return deny('POLICY_CONTEXT_MALFORMED', 'correlation');
  }

  return null;
};

export const validatePolicyContext = (
  candidate: unknown,
): PolicyContextValidation => {
  if (!isPlainObject(candidate) || !hasOnlyKeys(candidate, CONTEXT_KEYS)) {
    return deny('POLICY_CONTEXT_MALFORMED');
  }

  if (candidate.schemaVersion !== 1 || candidate.policyVersion !== 'p0-v1') {
    return deny('POLICY_VERSION_UNSUPPORTED');
  }

  if (
    typeof candidate.workspaceId !== 'string' ||
    !isValidUuid(candidate.workspaceId)
  ) {
    return deny('TENANT_CONTEXT_MISSING', 'workspaceId');
  }

  if (!isBoundedString(candidate.operation, MAX_OPERATION_LENGTH)) {
    return deny('POLICY_CONTEXT_MALFORMED', 'operation');
  }

  if (!['R0', 'R1', 'R2', 'R3'].includes(String(candidate.riskClass))) {
    return deny('POLICY_CONTEXT_MALFORMED', 'riskClass');
  }

  const actorValidation = validateActor(candidate.actor, candidate.workspaceId);

  if (actorValidation !== null) {
    return actorValidation;
  }

  const authorityValidation = validateAuthority(
    candidate.authority,
    candidate.actor as Record<string, unknown>,
    candidate.workspaceId,
    candidate.operation,
    candidate.riskClass,
  );

  if (authorityValidation !== null) {
    return authorityValidation;
  }

  const targetValidation = validateTarget(
    candidate.target,
    candidate.workspaceId,
  );

  if (targetValidation !== null) {
    return targetValidation;
  }

  if (!isUuidArray(candidate.affectedFieldMetadataIds)) {
    return deny('POLICY_CONTEXT_MALFORMED', 'affectedFieldMetadataIds');
  }

  const correlationValidation = validateCorrelation(candidate.correlation);

  if (correlationValidation !== null) {
    return correlationValidation;
  }

  return {
    valid: true,
    context: candidate as PolicyContext,
  };
};
