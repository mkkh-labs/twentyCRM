import { Injectable } from '@nestjs/common';

import { trace } from '@opentelemetry/api';

import { MetricsService } from 'src/engine/core-modules/metrics/metrics.service';
import { MetricsKeys } from 'src/engine/core-modules/metrics/types/metrics-keys.type';
import { type PolicyDecisionOutcome } from 'src/engine/core-modules/policy/types/policy-decision.type';
import { type PolicyRiskClass } from 'src/engine/core-modules/policy/types/policy-context.type';
import { sanitizePolicySpanAttributes } from 'src/engine/core-modules/sentry/utils/sanitize-policy-span-attributes.util';

@Injectable()
export class PolicyTelemetryService {
  constructor(private readonly metricsService: MetricsService) {}

  recordDecision({
    outcome,
    riskClass,
  }: Readonly<{
    outcome: PolicyDecisionOutcome;
    riskClass: PolicyRiskClass;
  }>): void {
    const attributes = sanitizePolicySpanAttributes({
      'policy.outcome': outcome,
      'policy.risk_class': riskClass,
    });

    this.metricsService.incrementCounterBy({
      key: MetricsKeys.PolicyDecision,
      amount: 1,
      attributes,
    });
    trace.getActiveSpan()?.setAttributes(attributes);
  }

  recordAuditUnavailable(): void {
    this.metricsService.incrementCounterBy({
      key: MetricsKeys.PolicyAuditUnavailable,
      amount: 1,
    });
  }

  recordReconciliationRequired(): void {
    this.metricsService.incrementCounterBy({
      key: MetricsKeys.ProtectedOperationReconciliationRequired,
      amount: 1,
    });
  }
}
