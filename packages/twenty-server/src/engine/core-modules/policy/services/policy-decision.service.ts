import { Injectable } from '@nestjs/common';

import { isValidUuid } from 'twenty-shared/utils';

import {
  PolicyException,
  PolicyExceptionCode,
} from 'src/engine/core-modules/policy/policy.exception';
import { type PolicyContext } from 'src/engine/core-modules/policy/types/policy-context.type';
import {
  type PolicyDecision,
  type PolicyDecisionOutcome,
  type PolicyDecisionReasonCode,
} from 'src/engine/core-modules/policy/types/policy-decision.type';
import { buildPolicyContextDigest } from 'src/engine/core-modules/policy/utils/build-policy-context-digest.util';
import { validatePolicyContext } from 'src/engine/core-modules/policy/utils/validate-policy-context.util';

export type CreatePolicyDecisionInput = Readonly<{
  context: PolicyContext;
  outcome: PolicyDecisionOutcome;
  reasonCodes: readonly PolicyDecisionReasonCode[];
  parentDecisionId?: string;
  evaluatedAt?: string;
}>;

@Injectable()
export class PolicyDecisionService {
  create({
    context,
    outcome,
    reasonCodes,
    parentDecisionId,
    evaluatedAt = new Date().toISOString(),
  }: CreatePolicyDecisionInput): PolicyDecision {
    const contextValidation = validatePolicyContext(context);

    if (!contextValidation.valid) {
      throw new PolicyException(
        'Policy decision requires a valid policy context.',
        PolicyExceptionCode.CONTEXT_INVALID,
      );
    }

    const normalizedReasonCodes = [...new Set(reasonCodes)].sort();

    this.assertOutcomeReasons(outcome, normalizedReasonCodes);

    if (
      (parentDecisionId !== undefined && !isValidUuid(parentDecisionId)) ||
      Number.isNaN(Date.parse(evaluatedAt))
    ) {
      throw new PolicyException(
        'Policy decision lineage or evaluation timestamp is invalid.',
        PolicyExceptionCode.DECISION_INVALID,
      );
    }

    return Object.freeze({
      schemaVersion: 1,
      id: context.correlation.decisionId,
      ...(parentDecisionId === undefined ? {} : { parentDecisionId }),
      workspaceId: context.workspaceId,
      contextDigest: buildPolicyContextDigest(context),
      outcome,
      reasonCodes: normalizedReasonCodes,
      policyVersion: context.policyVersion,
      riskClass: context.riskClass,
      evaluatedAt,
      correlation: context.correlation,
    });
  }

  private assertOutcomeReasons(
    outcome: PolicyDecisionOutcome,
    reasonCodes: readonly PolicyDecisionReasonCode[],
  ): void {
    if (
      outcome === 'ALLOW' &&
      (reasonCodes.length !== 1 || reasonCodes[0] !== 'AUTHORIZED')
    ) {
      throw new PolicyException(
        'Allow decisions require only the authorized reason.',
        PolicyExceptionCode.DECISION_INVALID,
      );
    }

    if (
      outcome === 'REQUIRE_APPROVAL' &&
      !reasonCodes.includes('APPROVAL_REQUIRED')
    ) {
      throw new PolicyException(
        'Approval decisions require the approval-required reason.',
        PolicyExceptionCode.DECISION_INVALID,
      );
    }

    if (
      outcome === 'DENY' &&
      (reasonCodes.length === 0 || reasonCodes.includes('AUTHORIZED'))
    ) {
      throw new PolicyException(
        'Deny decisions require at least one denial reason.',
        PolicyExceptionCode.DECISION_INVALID,
      );
    }
  }
}
