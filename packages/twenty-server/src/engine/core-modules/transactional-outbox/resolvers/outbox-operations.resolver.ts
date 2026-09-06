import { UseGuards } from '@nestjs/common';
import { Args, Int, Query } from '@nestjs/graphql';

import GraphQLJSON from 'graphql-type-json';
import { PermissionFlagType } from 'twenty-shared/constants';

import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';

import { OutboxOperationsService } from 'src/engine/core-modules/transactional-outbox/services/outbox-operations.service';
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
export class OutboxOperationsResolver {
  constructor(
    private readonly outboxOperationsService: OutboxOperationsService,
  ) {}

  @Query(() => GraphQLJSON)
  async outboxOperations(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('limit', { type: () => Int, defaultValue: 50 }) limit: number,
  ) {
    const operations = await this.outboxOperationsService.listRecent({
      workspaceId: workspace.id,
      limit,
    });

    return operations.map((operation) => ({
      id: operation.id,
      eventType: operation.eventType,
      schemaVersion: operation.schemaVersion,
      aggregateType: operation.aggregateType,
      aggregateId: operation.aggregateId,
      payloadDigest: operation.payloadDigest,
      rootCorrelationId: operation.rootCorrelationId,
      state: operation.state,
      attemptCount: operation.attemptCount,
      availableAt: operation.availableAt,
      publishedAt: operation.publishedAt,
      lastErrorCode: operation.lastErrorCode,
      createdAt: operation.createdAt,
      recoverySafety:
        operation.state === 'RECONCILIATION_REQUIRED'
          ? 'RECONCILE_BEFORE_REPLAY'
          : operation.state === 'DEAD'
            ? 'OPERATOR_REVIEW_REQUIRED'
            : operation.state === 'PUBLISHED'
              ? 'DELIVERY_ENVELOPE_PUBLISHED'
              : 'AUTOMATED_DISPATCH_MANAGED',
    }));
  }
}
