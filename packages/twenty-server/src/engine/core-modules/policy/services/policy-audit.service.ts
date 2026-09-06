import { Injectable } from '@nestjs/common';

import { isPlainObject, isValidUuid } from 'twenty-shared/utils';
import { type QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

import { PolicyAuditEventEntity } from 'src/engine/core-modules/policy/entities/policy-audit-event.entity';
import {
  PolicyAuditException,
  PolicyAuditExceptionCode,
} from 'src/engine/core-modules/policy/exceptions/policy-audit.exception';
import { type PolicyAuditEvent } from 'src/engine/core-modules/policy/types/policy-audit-event.type';
import { validatePolicyAuditMetadata } from 'src/engine/core-modules/policy/utils/validate-policy-audit-metadata.util';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

const SHA_256_PATTERN = /^[a-f0-9]{64}$/;
const MAX_EVENT_KEY_LENGTH = 256;
const MAX_OPERATION_LENGTH = 128;
const MAX_RESOURCE_TYPE_LENGTH = 128;

@Injectable()
export class PolicyAuditService {
  constructor(
    @InjectWorkspaceScopedRepository(PolicyAuditEventEntity)
    private readonly policyAuditEventRepository: WorkspaceScopedRepository<PolicyAuditEventEntity>,
  ) {}

  async append(event: PolicyAuditEvent): Promise<PolicyAuditEventEntity> {
    this.assertValidEvent(event);

    try {
      return await this.policyAuditEventRepository.insertAndReturnOne(
        event.workspaceId,
        this.toEntityInput(event),
      );
    } catch (error) {
      if (!this.isUniqueViolation(error)) {
        throw error;
      }

      const existing = await this.policyAuditEventRepository.findOneBy(
        event.workspaceId,
        { eventKey: event.eventKey },
      );

      if (
        existing === null ||
        existing.phase !== event.phase ||
        existing.policyDecisionId !== event.policyDecisionId ||
        existing.contextDigest !== event.contextDigest
      ) {
        throw new PolicyAuditException(
          'Audit event key is already bound to different evidence.',
          PolicyAuditExceptionCode.EVENT_KEY_CONFLICT,
        );
      }

      return existing;
    }
  }

  async listRecent({
    workspaceId,
    limit,
  }: Readonly<{
    workspaceId: string;
    limit: number;
  }>): Promise<PolicyAuditEventEntity[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error('Policy audit list limit is invalid.');
    }

    return this.policyAuditEventRepository.find(workspaceId, {
      order: { occurredAt: 'DESC' },
      take: limit,
    });
  }

  private assertValidEvent(event: PolicyAuditEvent): void {
    const metadataValidation = validatePolicyAuditMetadata(event.metadata);

    if (!metadataValidation.valid) {
      throw new PolicyAuditException(
        'Policy audit metadata was rejected by the closed allowlist.',
        PolicyAuditExceptionCode.SENSITIVE_METADATA_REJECTED,
      );
    }

    if (
      event.schemaVersion !== 1 ||
      !isValidUuid(event.eventId) ||
      !isValidUuid(event.workspaceId) ||
      !isValidUuid(event.policyDecisionId) ||
      (event.parentPolicyDecisionId !== undefined &&
        !isValidUuid(event.parentPolicyDecisionId)) ||
      event.correlation.decisionId !== event.policyDecisionId ||
      !isValidUuid(event.correlation.rootCorrelationId) ||
      !isValidUuid(event.correlation.attemptId) ||
      event.actor.workspaceId !== event.workspaceId ||
      event.eventKey.length === 0 ||
      event.eventKey.length > MAX_EVENT_KEY_LENGTH ||
      event.operation.length === 0 ||
      event.operation.length > MAX_OPERATION_LENGTH ||
      event.target.resourceType.length === 0 ||
      event.target.resourceType.length > MAX_RESOURCE_TYPE_LENGTH ||
      !SHA_256_PATTERN.test(event.contextDigest) ||
      Number.isNaN(Date.parse(event.occurredAt))
    ) {
      throw new PolicyAuditException(
        'Policy audit event failed tenant, identity, or schema validation.',
        PolicyAuditExceptionCode.INVALID_EVENT,
      );
    }
  }

  private toEntityInput(
    event: PolicyAuditEvent,
  ): QueryDeepPartialEntity<PolicyAuditEventEntity> {
    const isUserActor = event.actor.type === 'user';
    const isApplicationActor = event.actor.type === 'application';
    const isSystemActor = event.actor.type === 'system';

    return {
      id: event.eventId,
      workspaceId: event.workspaceId,
      eventKey: event.eventKey,
      schemaVersion: event.schemaVersion,
      occurredAt: new Date(event.occurredAt),
      phase: event.phase,
      actorType: event.actor.type,
      actorId: isSystemActor ? null : event.actor.id,
      workspaceMemberId: isUserActor ? event.actor.workspaceMemberId : null,
      applicationId: isUserActor
        ? (event.actor.applicationId ?? null)
        : isApplicationActor
          ? event.actor.id
          : null,
      serviceAuthorityId: isSystemActor ? event.actor.serviceAuthorityId : null,
      authoritySource: event.authoritySource,
      operation: event.operation,
      riskClass: event.riskClass,
      resourceType: event.target.resourceType,
      resourceId: event.target.resourceId ?? null,
      fieldMetadataIds: [...event.affectedFieldMetadataIds],
      policyDecisionId: event.policyDecisionId,
      parentPolicyDecisionId: event.parentPolicyDecisionId ?? null,
      policyOutcome: event.policyOutcome,
      result:
        event.phase === 'OUTCOME' || event.phase === 'RECONCILIATION'
          ? event.result
          : event.policyOutcome === 'DENY'
            ? 'denied'
            : 'unknown',
      reasonCodes: [...event.reasonCodes],
      policyVersion: 'p0-v1',
      contextDigest: event.contextDigest,
      rootCorrelationId: event.correlation.rootCorrelationId,
      attemptId: event.correlation.attemptId,
      traceId: event.correlation.traceId ?? null,
      workflowRunId: event.correlation.workflowRunId ?? null,
      jobId: event.correlation.jobId ?? null,
      mutationOrEffectId: event.correlation.mutationOrEffectId ?? null,
      metadata: event.metadata,
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    return isPlainObject(error) && error.code === '23505';
  }
}
