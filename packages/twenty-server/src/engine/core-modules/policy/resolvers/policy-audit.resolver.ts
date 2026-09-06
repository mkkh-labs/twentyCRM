import { UseGuards } from '@nestjs/common';
import { Args, Int, Query } from '@nestjs/graphql';

import GraphQLJSON from 'graphql-type-json';
import { PermissionFlagType } from 'twenty-shared/constants';

import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';

import { PolicyAuditService } from 'src/engine/core-modules/policy/services/policy-audit.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { RequireAccessTokenGuard } from 'src/engine/guards/require-access-token.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';

@CoreResolver()
@UseGuards(
  UserAuthGuard,
  WorkspaceAuthGuard,
  RequireAccessTokenGuard,
  SettingsPermissionGuard(PermissionFlagType.SECURITY),
)
export class PolicyAuditResolver {
  constructor(private readonly policyAuditService: PolicyAuditService) {}

  @Query(() => GraphQLJSON)
  async policyAuditEvents(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('limit', { type: () => Int, defaultValue: 50 }) limit: number,
  ) {
    const events = await this.policyAuditService.listRecent({
      workspaceId: workspace.id,
      limit,
    });

    return events.map((event) => ({
      id: event.id,
      occurredAt: event.occurredAt,
      phase: event.phase,
      actorType: event.actorType,
      actorId: event.actorId,
      authoritySource: event.authoritySource,
      operation: event.operation,
      riskClass: event.riskClass,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      policyDecisionId: event.policyDecisionId,
      policyOutcome: event.policyOutcome,
      result: event.result,
      reasonCodes: event.reasonCodes,
      rootCorrelationId: event.rootCorrelationId,
      attemptId: event.attemptId,
      traceId: event.traceId,
      workflowRunId: event.workflowRunId,
      jobId: event.jobId,
      mutationOrEffectId: event.mutationOrEffectId,
      metadata: event.metadata,
    }));
  }
}
