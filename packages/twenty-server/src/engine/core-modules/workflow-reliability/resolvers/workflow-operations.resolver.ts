import { UseGuards } from '@nestjs/common';
import { Args, Int, Query } from '@nestjs/graphql';

import GraphQLJSON from 'graphql-type-json';
import { PermissionFlagType } from 'twenty-shared/constants';

import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';

import { WorkflowEffectService } from 'src/engine/core-modules/workflow-reliability/services/workflow-effect.service';
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
  SettingsPermissionGuard(PermissionFlagType.WORKFLOWS),
)
export class WorkflowOperationsResolver {
  constructor(private readonly workflowEffectService: WorkflowEffectService) {}

  @Query(() => GraphQLJSON)
  async workflowOperations(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('limit', { type: () => Int, defaultValue: 50 }) limit: number,
  ) {
    const operations = await this.workflowEffectService.listRecent({
      workspaceId: workspace.id,
      limit,
    });

    return operations.map((operation) => ({
      id: operation.id,
      workflowRunId: operation.workflowRunId,
      stepId: operation.stepId,
      state: operation.state,
      attemptCount: operation.attemptCount,
      retryAt: operation.retryAt,
      providerClass: operation.providerClass,
      actionDigest: operation.actionDigest,
      providerReferenceDigest: operation.providerReferenceDigest,
      lastErrorCode: operation.lastErrorCode,
      uncertaintyReason: operation.uncertaintyReason,
      createdAt: operation.createdAt,
      updatedAt: operation.updatedAt,
      replaySafety:
        operation.state === 'SUCCEEDED'
          ? 'DEDUPLICATED_ALREADY_SUCCEEDED'
          : operation.uncertaintyReason !== null
            ? 'RECONCILIATION_REQUIRED_EXTERNAL_OUTCOME_UNKNOWN'
            : operation.state === 'DEAD_LETTERED'
              ? 'REPLAY_REQUIRES_DURABLE_SOURCE_ENVELOPE'
              : 'NOT_REPLAYABLE_IN_CURRENT_STATE',
    }));
  }
}
