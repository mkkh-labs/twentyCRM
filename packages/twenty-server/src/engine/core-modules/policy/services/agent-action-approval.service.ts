import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';
import { IsNull, MoreThan } from 'typeorm';

import { AgentActionApprovalEntity } from 'src/engine/core-modules/policy/entities/agent-action-approval.entity';
import { type AgentActionApproval } from 'src/engine/core-modules/policy/types/agent-action-approval.type';
import { buildAgentActionDigest } from 'src/engine/core-modules/policy/utils/build-agent-action-digest.util';
import { resolveAgentAction } from 'src/engine/core-modules/policy/utils/resolve-agent-action.util';
import { type ToolExecutionRef } from 'src/engine/core-modules/tool-provider/types/tool-execution-ref.type';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

@Injectable()
export class AgentActionApprovalService {
  constructor(
    @InjectWorkspaceScopedRepository(AgentActionApprovalEntity)
    private readonly repository: WorkspaceScopedRepository<AgentActionApprovalEntity>,
  ) {}

  async issueForTool({
    workspaceId,
    actorId,
    approverId,
    executionRef,
    arguments: actionArguments,
    expiresAt,
  }: Readonly<{
    workspaceId: string;
    actorId: string;
    approverId: string;
    executionRef: ToolExecutionRef;
    arguments: Readonly<Record<string, unknown>>;
    expiresAt: Date;
  }>): Promise<AgentActionApprovalEntity> {
    const action = resolveAgentAction(executionRef);
    const now = Date.now();

    if (
      (action.riskClass !== 'R2' && action.riskClass !== 'R3') ||
      expiresAt.getTime() <= now ||
      expiresAt.getTime() > now + 15 * 60 * 1000
    ) {
      throw new Error(
        'Approval must bind a material tool action and expire within 15 minutes.',
      );
    }

    return this.repository.insertAndReturnOne(workspaceId, {
      id: randomUUID(),
      actorId,
      approverId,
      action: action.action,
      target: action.target,
      riskClass: action.riskClass,
      actionDigest: buildAgentActionDigest({
        workspaceId,
        actorId,
        action: action.action,
        target: action.target,
        arguments: actionArguments,
      }),
      expiresAt,
      consumedAt: null,
      consumedByDecisionId: null,
    });
  }

  async findById({
    id,
    workspaceId,
  }: Readonly<{
    id: string;
    workspaceId: string;
  }>): Promise<AgentActionApproval | undefined> {
    const entity = await this.repository.findOne(workspaceId, {
      where: { id },
    });

    if (!isDefined(entity)) {
      return undefined;
    }

    return {
      id: entity.id,
      workspaceId: entity.workspaceId,
      actorId: entity.actorId,
      actionDigest: entity.actionDigest,
      approverId: entity.approverId,
      expiresAt: entity.expiresAt.toISOString(),
      consumedAt: entity.consumedAt?.toISOString() ?? null,
    };
  }

  async findActiveByBinding({
    workspaceId,
    actorId,
    actionDigest,
    now = new Date(),
  }: Readonly<{
    workspaceId: string;
    actorId: string;
    actionDigest: string;
    now?: Date;
  }>): Promise<AgentActionApproval | undefined> {
    const entity = await this.repository.findOne(workspaceId, {
      where: {
        actorId,
        actionDigest,
        consumedAt: IsNull(),
        expiresAt: MoreThan(now),
      },
      order: { createdAt: 'ASC' },
    });

    if (!isDefined(entity)) {
      return undefined;
    }

    return {
      id: entity.id,
      workspaceId: entity.workspaceId,
      actorId: entity.actorId,
      actionDigest: entity.actionDigest,
      approverId: entity.approverId,
      expiresAt: entity.expiresAt.toISOString(),
      consumedAt: entity.consumedAt?.toISOString() ?? null,
    };
  }

  async consume({
    id,
    workspaceId,
    actorId,
    actionDigest,
    consumedAt,
    decisionId,
  }: Readonly<{
    id: string;
    workspaceId: string;
    actorId: string;
    actionDigest: string;
    consumedAt: Date;
    decisionId?: string;
  }>): Promise<void> {
    const result = await this.repository.update(
      workspaceId,
      {
        id,
        actorId,
        actionDigest,
        consumedAt: IsNull(),
        expiresAt: MoreThan(consumedAt),
      },
      {
        consumedAt,
        consumedByDecisionId: decisionId ?? null,
      },
    );

    if (result.affected !== 1) {
      throw new Error(
        'Approval is expired, reused, or bound to another action.',
      );
    }
  }
}
