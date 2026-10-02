import { Injectable } from '@nestjs/common';

import { FeatureFlagKey } from 'twenty-shared/types';

import { FeatureFlagService } from 'src/engine/core-modules/feature-flag/services/feature-flag.service';
import { AgentActionApprovalService } from 'src/engine/core-modules/policy/services/agent-action-approval.service';
import { AgentActionApprovalRequestService } from 'src/engine/core-modules/policy/services/agent-action-approval-request.service';
import { AgentActionPolicyService } from 'src/engine/core-modules/policy/services/agent-action-policy.service';
import { PolicyContextService } from 'src/engine/core-modules/policy/services/policy-context.service';
import { PolicyCorrelationService } from 'src/engine/core-modules/policy/services/policy-correlation.service';
import { PolicyDecisionService } from 'src/engine/core-modules/policy/services/policy-decision.service';
import { ProtectedOperationService } from 'src/engine/core-modules/policy/services/protected-operation.service';
import { buildAgentActionDigest } from 'src/engine/core-modules/policy/utils/build-agent-action-digest.util';
import { resolveAgentAction } from 'src/engine/core-modules/policy/utils/resolve-agent-action.util';
import { type ResolvedToolProviderContext } from 'src/engine/core-modules/tool-provider/interfaces/tool-provider-context.type';
import { type ToolDescriptor } from 'src/engine/core-modules/tool-provider/types/tool-descriptor.type';
import { type ToolIndexEntry } from 'src/engine/core-modules/tool-provider/types/tool-index-entry.type';
import { resolveToolPolicyIdentity } from 'src/engine/core-modules/tool-provider/utils/resolve-tool-policy-identity.util';
import { type ToolOutput } from 'src/engine/core-modules/tool/types/tool-output.type';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

@Injectable()
export class ToolPolicyExecutionService {
  constructor(
    private readonly featureFlagService: FeatureFlagService,
    private readonly twentyConfigService: TwentyConfigService,
    private readonly agentActionApprovalService: AgentActionApprovalService,
    private readonly agentActionApprovalRequestService: AgentActionApprovalRequestService,
    private readonly agentActionPolicyService: AgentActionPolicyService,
    private readonly policyContextService: PolicyContextService,
    private readonly policyCorrelationService: PolicyCorrelationService,
    private readonly policyDecisionService: PolicyDecisionService,
    private readonly protectedOperationService: ProtectedOperationService,
  ) {}

  async execute({
    descriptor,
    arguments: actionArguments,
    context,
    roleAllowed,
    effect,
  }: Readonly<{
    descriptor: ToolIndexEntry | ToolDescriptor;
    arguments: Record<string, unknown>;
    context: ResolvedToolProviderContext;
    roleAllowed: boolean;
    effect: () => Promise<ToolOutput>;
  }>): Promise<ToolOutput> {
    const action = resolveAgentAction(descriptor.executionRef);
    const identity = resolveToolPolicyIdentity({
      workspaceId: context.workspaceId,
      roleId: context.roleId,
      rolePermissionConfig: context.rolePermissionConfig,
      authContext: context.authContext,
      serviceAuthorityId: context.serviceAuthorityId,
      operation: action.action,
    });
    const correlation = this.policyCorrelationService.createAttempt({
      rootCorrelationId: context.rootCorrelationId,
      jobId: context.jobId,
      workflowRunId: context.workflowRunId,
      mutationOrEffectId: context.mutationOrEffectId,
    });
    const actorId =
      identity.actor.type === 'system'
        ? identity.actor.serviceAuthorityId
        : identity.actor.id;
    const actionDigest = buildAgentActionDigest({
      workspaceId: context.workspaceId,
      actorId,
      action: action.action,
      target: action.target,
      arguments: actionArguments,
      workflowRunId: context.workflowRunId,
      workflowStepId: context.workflowStepId,
    });
    const approval = context.approvalId
      ? await this.agentActionApprovalService.findById({
          id: context.approvalId,
          workspaceId: context.workspaceId,
        })
      : await this.agentActionApprovalService.findActiveByBinding({
          workspaceId: context.workspaceId,
          actorId,
          actionDigest,
        });
    const policyResult = this.agentActionPolicyService.evaluate({
      riskClass: action.riskClass,
      workspaceId: context.workspaceId,
      actorId,
      actionDigest,
      roleAllowed,
      automationAllowed: context.automationAllowed === true,
      globalWritesEnabled:
        this.twentyConfigService.get('AGENT_WRITES_ENABLED') === true,
      workspaceWritesEnabled: await this.featureFlagService.isFeatureEnabled(
        FeatureFlagKey.IS_AGENT_WRITES_ENABLED,
        context.workspaceId,
      ),
      evaluatedAt: new Date().toISOString(),
      approval,
    });
    const policyContext = this.policyContextService.create({
      workspaceId: context.workspaceId,
      actor: identity.actor,
      authority: identity.authority,
      operation: action.action,
      riskClass: action.riskClass,
      target: {
        workspaceId: context.workspaceId,
        resourceType: action.target,
        objectMetadataId: context.objectMetadataId,
        recordIds: context.recordIds,
        fieldMetadataIds: context.affectedFieldMetadataIds,
      },
      affectedFieldMetadataIds: context.affectedFieldMetadataIds ?? [],
      correlation,
    });
    const decision = this.policyDecisionService.create({
      context: policyContext,
      outcome: policyResult.outcome,
      reasonCodes: policyResult.reasonCodes,
    });
    const result = await this.protectedOperationService.execute({
      context: policyContext,
      decision,
      auditMetadata: {
        argumentDigest: actionDigest,
        ...(approval === undefined ? {} : { approvalId: approval.id }),
      },
      execute: async () => {
        if (
          (action.riskClass === 'R2' || action.riskClass === 'R3') &&
          approval !== undefined
        ) {
          await this.agentActionApprovalService.consume({
            id: approval.id,
            workspaceId: context.workspaceId,
            actorId,
            actionDigest,
            consumedAt: new Date(),
            decisionId: decision.id,
          });
        }

        return effect();
      },
    });

    if (
      result.status === 'DENIED' &&
      result.reasonCodes.includes('APPROVAL_REQUIRED')
    ) {
      await this.agentActionApprovalRequestService.request({
        workspaceId: context.workspaceId,
        actorId,
        action: action.action,
        target: action.target,
        riskClass: action.riskClass,
        actionDigest,
        workflowRunId: context.workflowRunId,
        workflowStepId: context.workflowStepId,
        rootCorrelationId: policyContext.correlation.rootCorrelationId,
        originPolicyDecisionId: decision.id,
      });
    }

    if (result.status === 'SUCCEEDED') {
      return result.value;
    }

    if (result.status === 'RECONCILIATION_REQUIRED') {
      return {
        success: false,
        message: 'Tool outcome requires reconciliation',
        error: `Policy decision ${result.policyDecisionId} could not durably record the outcome.`,
      };
    }

    return {
      success: false,
      message: 'Tool execution denied by policy',
      error: result.reasonCodes.join(','),
    };
  }
}
