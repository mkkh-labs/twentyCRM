import { Injectable } from '@nestjs/common';
import {
  type HealthIndicatorResult,
  HealthIndicatorService,
} from '@nestjs/terminus';
import { InjectRepository } from '@nestjs/typeorm';

import { IsNull, LessThan, Not, type Repository } from 'typeorm';

import { PolicyAuditEventEntity } from 'src/engine/core-modules/policy/entities/policy-audit-event.entity';
import { OUTBOX_CONSUMER_PROCESSING_LEASE_MILLISECONDS } from 'src/engine/core-modules/transactional-outbox/constants/outbox-consumer-processing-lease.constant';
import { OutboxConsumerReceiptEntity } from 'src/engine/core-modules/transactional-outbox/entities/outbox-consumer-receipt.entity';
import { OutboxEventEntity } from 'src/engine/core-modules/transactional-outbox/entities/outbox-event.entity';
import { WorkflowEffectExecutionEntity } from 'src/engine/core-modules/workflow-reliability/entities/workflow-effect-execution.entity';

const POLICY_OUTCOME_GRACE_MILLISECONDS = 15 * 60 * 1000;

type IdealCrmHealthDetails = Readonly<{
  outbox: Readonly<{
    consumerReconciliationRequired: number;
    consumerStaleProcessing: number;
    dead: number;
    reconciliationRequired: number;
  }>;
  policyAudit: Readonly<{
    unresolvedAllowedDecisions: number;
  }>;
  workflowEffects: Readonly<{
    deadLettered: number;
    failedPermanent: number;
    uncertain: number;
  }>;
}>;

@Injectable()
export class IdealCrmHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    // Server-admin health aggregates counts across workspaces without returning tenant data.
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository
    @InjectRepository(OutboxEventEntity)
    private readonly outboxEventRepository: Repository<OutboxEventEntity>,
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository
    @InjectRepository(OutboxConsumerReceiptEntity)
    private readonly outboxConsumerReceiptRepository: Repository<OutboxConsumerReceiptEntity>,
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository
    @InjectRepository(PolicyAuditEventEntity)
    private readonly policyAuditEventRepository: Repository<PolicyAuditEventEntity>,
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository
    @InjectRepository(WorkflowEffectExecutionEntity)
    private readonly workflowEffectExecutionRepository: Repository<WorkflowEffectExecutionEntity>,
  ) {}

  async isHealthy(): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check('idealCrm');

    try {
      const details = await this.getHealthDetails();

      if (this.hasUnresolvedConditions(details)) {
        return indicator.down({
          message: 'Ideal CRM has unresolved protected-operation conditions.',
          details,
        });
      }

      return indicator.up({ details });
    } catch {
      return indicator.down({
        message: 'Ideal CRM recovery health could not be evaluated.',
      });
    }
  }

  private async getHealthDetails(): Promise<IdealCrmHealthDetails> {
    const [
      outboxDead,
      outboxReconciliationRequired,
      outboxConsumerReconciliationRequired,
      outboxConsumerStaleProcessing,
      workflowDeadLettered,
      workflowFailedPermanent,
      workflowUncertain,
      unresolvedAllowedDecisions,
    ] = await Promise.all([
      this.outboxEventRepository.countBy({ state: 'DEAD' }),
      this.outboxEventRepository.countBy({
        state: 'RECONCILIATION_REQUIRED',
      }),
      this.outboxConsumerReceiptRepository.countBy({
        state: 'RECONCILIATION_REQUIRED',
      }),
      this.outboxConsumerReceiptRepository.countBy({
        state: 'PROCESSING',
        updatedAt: LessThan(
          new Date(
            Date.now() - OUTBOX_CONSUMER_PROCESSING_LEASE_MILLISECONDS,
          ),
        ),
      }),
      this.workflowEffectExecutionRepository.countBy({
        state: 'DEAD_LETTERED',
      }),
      this.workflowEffectExecutionRepository.countBy({
        state: 'FAILED_PERMANENT',
      }),
      this.workflowEffectExecutionRepository.countBy({
        uncertaintyReason: Not(IsNull()),
      }),
      this.countUnresolvedAllowedDecisions(),
    ]);

    return {
      outbox: {
        consumerReconciliationRequired: outboxConsumerReconciliationRequired,
        consumerStaleProcessing: outboxConsumerStaleProcessing,
        dead: outboxDead,
        reconciliationRequired: outboxReconciliationRequired,
      },
      policyAudit: {
        unresolvedAllowedDecisions,
      },
      workflowEffects: {
        deadLettered: workflowDeadLettered,
        failedPermanent: workflowFailedPermanent,
        uncertain: workflowUncertain,
      },
    };
  }

  private async countUnresolvedAllowedDecisions(): Promise<number> {
    const cutoff = new Date(Date.now() - POLICY_OUTCOME_GRACE_MILLISECONDS);
    const result = await this.policyAuditEventRepository
      .createQueryBuilder('intent')
      .select(
        'COUNT(DISTINCT ("intent"."workspaceId", "intent"."policyDecisionId"))',
        'count',
      )
      .where('"intent"."policyOutcome" = :policyOutcome', {
        policyOutcome: 'ALLOW',
      })
      .andWhere('"intent"."result" = :result', { result: 'unknown' })
      .andWhere('"intent"."occurredAt" <= :cutoff', { cutoff })
      .andWhere(`NOT EXISTS (
        SELECT 1
        FROM "core"."policyAuditEvent" "outcome"
        WHERE "outcome"."workspaceId" = "intent"."workspaceId"
          AND "outcome"."policyDecisionId" = "intent"."policyDecisionId"
          AND "outcome"."phase" IN ('OUTCOME', 'RECONCILIATION')
      )`)
      .getRawOne<{ count: string }>();
    const count = Number(result?.count);

    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error('Policy audit readiness count is invalid.');
    }

    return count;
  }

  private hasUnresolvedConditions(details: IdealCrmHealthDetails): boolean {
    return (
      details.outbox.dead > 0 ||
      details.outbox.consumerReconciliationRequired > 0 ||
      details.outbox.consumerStaleProcessing > 0 ||
      details.outbox.reconciliationRequired > 0 ||
      details.policyAudit.unresolvedAllowedDecisions > 0 ||
      details.workflowEffects.deadLettered > 0 ||
      details.workflowEffects.failedPermanent > 0 ||
      details.workflowEffects.uncertain > 0
    );
  }
}
