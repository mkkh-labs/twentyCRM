import { Injectable } from '@nestjs/common';

import { type AgentActionApproval } from 'src/engine/core-modules/policy/types/agent-action-approval.type';
import { type PolicyRiskClass } from 'src/engine/core-modules/policy/types/policy-context.type';
import {
  type PolicyDecisionOutcome,
  type PolicyDecisionReasonCode,
} from 'src/engine/core-modules/policy/types/policy-decision.type';

export type AgentActionPolicyInput = Readonly<{
  riskClass: PolicyRiskClass;
  workspaceId: string;
  actorId: string;
  actionDigest: string;
  roleAllowed: boolean;
  automationAllowed: boolean;
  globalWritesEnabled: boolean;
  workspaceWritesEnabled: boolean;
  evaluatedAt: string;
  approval?: AgentActionApproval;
}>;

export type AgentActionPolicyResult = Readonly<{
  outcome: PolicyDecisionOutcome;
  reasonCodes: readonly PolicyDecisionReasonCode[];
}>;

@Injectable()
export class AgentActionPolicyService {
  evaluate(input: AgentActionPolicyInput): AgentActionPolicyResult {
    if (!input.roleAllowed) {
      return { outcome: 'DENY', reasonCodes: ['ROLE_DENIED'] };
    }

    if (input.riskClass === 'R0') {
      return { outcome: 'ALLOW', reasonCodes: ['AUTHORIZED'] };
    }

    if (!input.globalWritesEnabled || !input.workspaceWritesEnabled) {
      return { outcome: 'DENY', reasonCodes: ['KILL_SWITCH_ACTIVE'] };
    }

    if (!input.automationAllowed) {
      return { outcome: 'DENY', reasonCodes: ['AUTOMATION_DENIED'] };
    }

    if (input.riskClass === 'R1') {
      return { outcome: 'ALLOW', reasonCodes: ['AUTHORIZED'] };
    }

    if (input.approval === undefined) {
      return {
        outcome: 'REQUIRE_APPROVAL',
        reasonCodes: ['APPROVAL_REQUIRED'],
      };
    }

    if (
      input.approval.workspaceId !== input.workspaceId ||
      input.approval.actorId !== input.actorId ||
      input.approval.actionDigest !== input.actionDigest
    ) {
      return { outcome: 'DENY', reasonCodes: ['APPROVAL_MISMATCH'] };
    }

    if (input.approval.consumedAt !== null) {
      return { outcome: 'DENY', reasonCodes: ['APPROVAL_REUSED'] };
    }

    if (Date.parse(input.approval.expiresAt) <= Date.parse(input.evaluatedAt)) {
      return { outcome: 'DENY', reasonCodes: ['APPROVAL_EXPIRED'] };
    }

    return { outcome: 'ALLOW', reasonCodes: ['AUTHORIZED'] };
  }
}
