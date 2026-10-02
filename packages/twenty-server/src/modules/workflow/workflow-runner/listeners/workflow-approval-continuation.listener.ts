import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { isNonEmptyString } from '@sniptt/guards';
import { isDefined, isValidUuid } from 'twenty-shared/utils';

import { AgentActionApprovalRequestService } from 'src/engine/core-modules/policy/services/agent-action-approval-request.service';
import { type OutboxEventDeliveryEnvelope } from 'src/engine/core-modules/transactional-outbox/types/outbox-event-delivery-envelope.type';
import { WorkflowServiceAuthorityWorkspaceService } from 'src/modules/workflow/common/workspace-services/workflow-service-authority.workspace-service';
import { WorkflowRunnerWorkspaceService } from 'src/modules/workflow/workflow-runner/workspace-services/workflow-runner.workspace-service';

@Injectable()
export class WorkflowApprovalContinuationListener {
  constructor(
    private readonly approvalRequestService: AgentActionApprovalRequestService,
    private readonly workflowServiceAuthority: WorkflowServiceAuthorityWorkspaceService,
    private readonly workflowRunner: WorkflowRunnerWorkspaceService,
  ) {}

  @OnEvent('outbox.agent.action.approved.v1')
  async handle(envelope: OutboxEventDeliveryEnvelope): Promise<void> {
    const requestId = envelope.payload.requestId;
    const approvalId = envelope.payload.approvalId;

    if (
      envelope.eventType !== 'agent.action.approved' ||
      envelope.schemaVersion !== 1 ||
      envelope.aggregateType !== 'agentActionApprovalRequest' ||
      typeof requestId !== 'string' ||
      typeof approvalId !== 'string' ||
      !isValidUuid(requestId) ||
      !isValidUuid(approvalId) ||
      envelope.aggregateId !== requestId
    ) {
      throw new Error('Agent action approval continuation event is invalid.');
    }

    const request = await this.approvalRequestService.findApprovedContinuation({
      workspaceId: envelope.workspaceId,
      requestId,
      approvalId,
    });

    if (!isDefined(request)) {
      throw new Error('Agent action approval continuation is missing.');
    }

    const hasWorkflowBinding =
      isDefined(request.workflowRunId) ||
      isDefined(request.workflowStepId) ||
      isDefined(request.rootCorrelationId) ||
      isDefined(request.originPolicyDecisionId);

    if (!hasWorkflowBinding) {
      return;
    }

    const workflowRunId = request.workflowRunId;
    const workflowStepId = request.workflowStepId;
    const rootCorrelationId = request.rootCorrelationId;
    const originPolicyDecisionId = request.originPolicyDecisionId;

    if (
      typeof workflowRunId !== 'string' ||
      typeof workflowStepId !== 'string' ||
      typeof rootCorrelationId !== 'string' ||
      typeof originPolicyDecisionId !== 'string' ||
      !isValidUuid(workflowRunId) ||
      !isNonEmptyString(workflowStepId) ||
      !isValidUuid(rootCorrelationId) ||
      !isValidUuid(originPolicyDecisionId)
    ) {
      throw new Error('Workflow approval continuation binding is invalid.');
    }

    const { authContext, rolePermissionConfig } =
      await this.workflowServiceAuthority.resolve(envelope.workspaceId);

    await this.workflowRunner.retryWorkflowStepWithApproval({
      workspaceId: envelope.workspaceId,
      workflowRunId,
      workflowStepId,
      approvalId,
      rootCorrelationId,
      originPolicyDecisionId,
      authContext,
      rolePermissionConfig,
    });
  }
}
