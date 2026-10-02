import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { type AuthContextUser } from 'src/engine/core-modules/auth/types/auth-context.type';
import { AgentActionApprovalDTO } from 'src/engine/core-modules/policy/dtos/agent-action-approval.dto';
import { AgentActionApprovalRequestDTO } from 'src/engine/core-modules/policy/dtos/agent-action-approval-request.dto';
import { ApproveAgentActionRequestInput } from 'src/engine/core-modules/policy/dtos/approve-agent-action-request.input';
import { CreateAgentActionApprovalInput } from 'src/engine/core-modules/policy/dtos/create-agent-action-approval.input';
import { AgentActionApprovalService } from 'src/engine/core-modules/policy/services/agent-action-approval.service';
import { AgentActionApprovalRequestService } from 'src/engine/core-modules/policy/services/agent-action-approval-request.service';
import { parseToolExecutionRef } from 'src/engine/core-modules/policy/utils/parse-tool-execution-ref.util';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUser } from 'src/engine/decorators/auth/auth-user.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { RequireAccessTokenGuard } from 'src/engine/guards/require-access-token.guard';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';

@MetadataResolver()
@UseGuards(
  UserAuthGuard,
  WorkspaceAuthGuard,
  RequireAccessTokenGuard,
  SettingsPermissionGuard(PermissionFlagType.SECURITY),
)
export class AgentActionApprovalResolver {
  constructor(
    private readonly approvalService: AgentActionApprovalService,
    private readonly approvalRequestService: AgentActionApprovalRequestService,
  ) {}

  @Query(() => [AgentActionApprovalRequestDTO])
  pendingAgentActionApprovalRequests(
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<AgentActionApprovalRequestDTO[]> {
    return this.approvalRequestService.listPending({
      workspaceId: workspace.id,
    });
  }

  @Mutation(() => AgentActionApprovalDTO)
  async createAgentActionApproval(
    @Args('input') input: CreateAgentActionApprovalInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUser() user: AuthContextUser,
  ): Promise<AgentActionApprovalDTO> {
    return this.approvalService.issueForTool({
      workspaceId: workspace.id,
      actorId: input.actorId,
      approverId: user.id,
      executionRef: parseToolExecutionRef(input),
      arguments: input.arguments,
      expiresAt: new Date(input.expiresAt),
    });
  }

  @Mutation(() => AgentActionApprovalDTO)
  approveAgentActionRequest(
    @Args('input') input: ApproveAgentActionRequestInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUser() user: AuthContextUser,
  ): Promise<AgentActionApprovalDTO> {
    return this.approvalRequestService.approve({
      workspaceId: workspace.id,
      requestId: input.requestId,
      approverId: user.id,
      expiresAt: new Date(input.expiresAt),
    });
  }

  @Mutation(() => AgentActionApprovalRequestDTO)
  denyAgentActionRequest(
    @Args('requestId', { type: () => ID }) requestId: string,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<AgentActionApprovalRequestDTO> {
    return this.approvalRequestService.deny({
      workspaceId: workspace.id,
      requestId,
    });
  }
}
