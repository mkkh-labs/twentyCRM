import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { PolicyAuditService } from 'src/engine/core-modules/policy/services/policy-audit.service';
import { PolicyTelemetryService } from 'src/engine/core-modules/policy/services/policy-telemetry.service';
import {
  type PolicyAuditEvent,
  type PolicyAuditPhase,
  type PolicyAuditResult,
} from 'src/engine/core-modules/policy/types/policy-audit-event.type';
import { type PolicyAuditMetadata } from 'src/engine/core-modules/policy/types/policy-audit-metadata.type';
import { type PolicyContext } from 'src/engine/core-modules/policy/types/policy-context.type';
import { type PolicyDecision } from 'src/engine/core-modules/policy/types/policy-decision.type';
import {
  type ProtectedOperationInput,
  type ProtectedOperationResult,
} from 'src/engine/core-modules/policy/types/protected-operation.type';
import { buildPolicyContextDigest } from 'src/engine/core-modules/policy/utils/build-policy-context-digest.util';
import { validatePolicyAuditMetadata } from 'src/engine/core-modules/policy/utils/validate-policy-audit-metadata.util';
import { validatePolicyContext } from 'src/engine/core-modules/policy/utils/validate-policy-context.util';

@Injectable()
export class ProtectedOperationService {
  constructor(
    private readonly policyAuditService: PolicyAuditService,
    private readonly policyTelemetryService: PolicyTelemetryService,
  ) {}

  async execute<TResult>({
    context,
    decision,
    auditMetadata,
    execute,
    getProviderReference,
  }: ProtectedOperationInput<TResult>): Promise<
    ProtectedOperationResult<TResult>
  > {
    this.assertDecisionBinding({ context, decision, auditMetadata });
    this.policyTelemetryService.recordDecision({
      outcome: decision.outcome,
      riskClass: decision.riskClass,
    });

    try {
      await this.policyAuditService.append(
        this.buildAuditEvent({
          context,
          decision,
          auditMetadata,
          phase: 'DECISION',
          result: decision.outcome === 'ALLOW' ? 'unknown' : 'denied',
        }),
      );
    } catch {
      this.policyTelemetryService.recordAuditUnavailable();
      return {
        status: 'DENIED',
        policyDecisionId: decision.id,
        reasonCodes: ['AUDIT_UNAVAILABLE'],
      };
    }

    if (decision.outcome !== 'ALLOW') {
      return {
        status: 'DENIED',
        policyDecisionId: decision.id,
        reasonCodes: decision.reasonCodes,
      };
    }

    if (context.riskClass === 'R2' || context.riskClass === 'R3') {
      try {
        await this.policyAuditService.append(
          this.buildAuditEvent({
            context,
            decision,
            auditMetadata,
            phase: 'INTENT',
            result: 'unknown',
          }),
        );
      } catch {
        this.policyTelemetryService.recordAuditUnavailable();
        return {
          status: 'DENIED',
          policyDecisionId: decision.id,
          reasonCodes: ['AUDIT_UNAVAILABLE'],
        };
      }
    }

    let value: TResult;

    try {
      value = await execute();
    } catch (error) {
      try {
        await this.policyAuditService.append(
          this.buildAuditEvent({
            context,
            decision,
            auditMetadata,
            phase: 'OUTCOME',
            result: 'failed',
          }),
        );
      } catch {
        this.policyTelemetryService.recordAuditUnavailable();
        this.policyTelemetryService.recordReconciliationRequired();
        return {
          status: 'RECONCILIATION_REQUIRED',
          policyDecisionId: decision.id,
        };
      }

      throw error;
    }

    const providerReference = getProviderReference?.(value);

    try {
      await this.policyAuditService.append(
        this.buildAuditEvent({
          context,
          decision,
          auditMetadata,
          phase: 'OUTCOME',
          result: 'success',
        }),
      );
    } catch {
      this.policyTelemetryService.recordAuditUnavailable();
      this.policyTelemetryService.recordReconciliationRequired();
      return {
        status: 'RECONCILIATION_REQUIRED',
        policyDecisionId: decision.id,
        ...(providerReference === undefined ? {} : { providerReference }),
      };
    }

    return {
      status: 'SUCCEEDED',
      value,
      policyDecisionId: decision.id,
      ...(decision.parentDecisionId === undefined
        ? {}
        : { parentPolicyDecisionId: decision.parentDecisionId }),
    };
  }

  private assertDecisionBinding({
    context,
    decision,
    auditMetadata,
  }: {
    context: PolicyContext;
    decision: PolicyDecision;
    auditMetadata: PolicyAuditMetadata;
  }): void {
    const contextValidation = validatePolicyContext(context);
    const metadataValidation = validatePolicyAuditMetadata(auditMetadata);

    if (
      !contextValidation.valid ||
      !metadataValidation.valid ||
      decision.schemaVersion !== 1 ||
      decision.policyVersion !== context.policyVersion ||
      decision.id !== context.correlation.decisionId ||
      decision.workspaceId !== context.workspaceId ||
      decision.riskClass !== context.riskClass ||
      decision.contextDigest !== buildPolicyContextDigest(context) ||
      decision.correlation.rootCorrelationId !==
        context.correlation.rootCorrelationId ||
      decision.correlation.attemptId !== context.correlation.attemptId
    ) {
      throw new Error('Policy decision is not bound to the supplied context.');
    }
  }

  private buildAuditEvent({
    context,
    decision,
    auditMetadata,
    phase,
    result,
  }: {
    context: PolicyContext;
    decision: PolicyDecision;
    auditMetadata: PolicyAuditMetadata;
    phase: PolicyAuditPhase;
    result: PolicyAuditResult;
  }): PolicyAuditEvent {
    const baseEvent = {
      schemaVersion: 1 as const,
      eventId: randomUUID(),
      eventKey: `${decision.id}:${phase}`,
      workspaceId: context.workspaceId,
      actor: context.actor,
      authoritySource: context.authority.source,
      operation: context.operation,
      riskClass: context.riskClass,
      target: {
        resourceType: context.target.resourceType,
        ...(context.target.resourceId === undefined
          ? {}
          : { resourceId: context.target.resourceId }),
      },
      affectedFieldMetadataIds: context.affectedFieldMetadataIds,
      policyDecisionId: decision.id,
      ...(decision.parentDecisionId === undefined
        ? {}
        : { parentPolicyDecisionId: decision.parentDecisionId }),
      policyOutcome: decision.outcome,
      reasonCodes: decision.reasonCodes,
      contextDigest: decision.contextDigest,
      correlation: context.correlation,
      metadata: auditMetadata,
      occurredAt: new Date().toISOString(),
    };

    if (phase === 'OUTCOME' || phase === 'RECONCILIATION') {
      return { ...baseEvent, phase, result };
    }

    return { ...baseEvent, phase };
  }
}
