import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

import { isPlainObject } from 'twenty-shared/utils';
import { DataSource, IsNull, MoreThan } from 'typeorm';

import { AgentActionApprovalRequestEntity } from 'src/engine/core-modules/policy/entities/agent-action-approval-request.entity';
import { AgentActionApprovalEntity } from 'src/engine/core-modules/policy/entities/agent-action-approval.entity';
import { type PolicyRiskClass } from 'src/engine/core-modules/policy/types/policy-context.type';
import { TransactionalOutboxService } from 'src/engine/core-modules/transactional-outbox/services/transactional-outbox.service';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

const REQUEST_TTL_MILLISECONDS = 15 * 60 * 1000;

@Injectable()
export class AgentActionApprovalRequestService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectWorkspaceScopedRepository(AgentActionApprovalRequestEntity)
    private readonly repository: WorkspaceScopedRepository<AgentActionApprovalRequestEntity>,
    private readonly transactionalOutboxService: TransactionalOutboxService,
  ) {}

  async request({
    workspaceId,
    actorId,
    action,
    target,
    riskClass,
    actionDigest,
    workflowRunId,
    workflowStepId,
    rootCorrelationId,
    originPolicyDecisionId,
    now = new Date(),
  }: Readonly<{
    workspaceId: string;
    actorId: string;
    action: string;
    target: string;
    riskClass: PolicyRiskClass;
    actionDigest: string;
    workflowRunId?: string;
    workflowStepId?: string;
    rootCorrelationId?: string;
    originPolicyDecisionId?: string;
    now?: Date;
  }>): Promise<AgentActionApprovalRequestEntity> {
    if (riskClass !== 'R2' && riskClass !== 'R3') {
      throw new Error('Only material actions can request approval.');
    }

    try {
      return await this.repository.insertAndReturnOne(workspaceId, {
        id: randomUUID(),
        actorId,
        action,
        target,
        riskClass,
        actionDigest,
        status: 'PENDING',
        expiresAt: new Date(now.getTime() + REQUEST_TTL_MILLISECONDS),
        approvalId: null,
        workflowRunId: workflowRunId ?? null,
        workflowStepId: workflowStepId ?? null,
        rootCorrelationId: rootCorrelationId ?? null,
        originPolicyDecisionId: originPolicyDecisionId ?? null,
      });
    } catch (error) {
      if (!this.isUniqueViolation(error)) {
        throw error;
      }

      const existing = await this.repository.findOne(workspaceId, {
        where: { actorId, actionDigest, status: 'PENDING' },
      });

      if (existing === null) {
        throw error;
      }

      if (existing.expiresAt.getTime() <= now.getTime()) {
        const expired = await this.repository.update(
          workspaceId,
          { id: existing.id, status: 'PENDING' },
          { status: 'EXPIRED' },
        );

        if (expired.affected === 1) {
          return this.request({
            workspaceId,
            actorId,
            action,
            target,
            riskClass,
            actionDigest,
            workflowRunId,
            workflowStepId,
            rootCorrelationId,
            originPolicyDecisionId,
            now,
          });
        }

        throw new Error('Approval request changed concurrently.');
      }

      return existing;
    }
  }

  async listPending({
    workspaceId,
    now = new Date(),
  }: Readonly<{
    workspaceId: string;
    now?: Date;
  }>): Promise<AgentActionApprovalRequestEntity[]> {
    return this.repository.find(workspaceId, {
      where: { status: 'PENDING', expiresAt: MoreThan(now) },
      order: { createdAt: 'ASC' },
      take: 100,
    });
  }

  findApprovedContinuation({
    workspaceId,
    requestId,
    approvalId,
  }: Readonly<{
    workspaceId: string;
    requestId: string;
    approvalId: string;
  }>): Promise<AgentActionApprovalRequestEntity | null> {
    return this.repository.findOne(workspaceId, {
      where: { id: requestId, approvalId, status: 'APPROVED' },
    });
  }

  async approve({
    workspaceId,
    requestId,
    approverId,
    expiresAt,
    now = new Date(),
  }: Readonly<{
    workspaceId: string;
    requestId: string;
    approverId: string;
    expiresAt: Date;
    now?: Date;
  }>): Promise<AgentActionApprovalEntity> {
    if (
      expiresAt.getTime() <= now.getTime() ||
      expiresAt.getTime() > now.getTime() + REQUEST_TTL_MILLISECONDS
    ) {
      throw new Error('Approval must expire within 15 minutes.');
    }

    const approvalId = randomUUID();

    const { approval } = await this.transactionalOutboxService.execute<{
      approval: AgentActionApprovalEntity;
      rootCorrelationId: string;
    }>({
      workspaceId,
      event: ({ rootCorrelationId }) => ({
        id: randomUUID(),
        eventType: 'agent.action.approved',
        schemaVersion: 1,
        aggregateType: 'agentActionApprovalRequest',
        aggregateId: requestId,
        payload: { requestId, approvalId },
        rootCorrelationId,
      }),
      mutate: async (manager) => {
        const request = await manager
          .getRepository(AgentActionApprovalRequestEntity)
          .findOne({
            where: {
              id: requestId,
              workspaceId,
              status: 'PENDING',
              approvalId: IsNull(),
              expiresAt: MoreThan(now),
            },
            lock: { mode: 'pessimistic_write' },
          });

        if (request === null) {
          throw new Error('Approval request is missing, expired, or resolved.');
        }

        if (request.riskClass !== 'R2' && request.riskClass !== 'R3') {
          throw new Error('Approval request risk classification is invalid.');
        }

        const approvalRepository = manager.getRepository(
          AgentActionApprovalEntity,
        );
        const approval = approvalRepository.create({
          id: approvalId,
          workspaceId,
          actorId: request.actorId,
          approverId,
          action: request.action,
          target: request.target,
          riskClass: request.riskClass,
          actionDigest: request.actionDigest,
          expiresAt,
          consumedAt: null,
          consumedByDecisionId: null,
        });

        await approvalRepository.save(approval);
        const updateResult = await manager
          .getRepository(AgentActionApprovalRequestEntity)
          .update(
            { id: request.id, workspaceId, status: 'PENDING' },
            { status: 'APPROVED', approvalId: approval.id },
          );

        if (updateResult.affected !== 1) {
          throw new Error('Approval request changed concurrently.');
        }

        return {
          approval,
          rootCorrelationId: request.rootCorrelationId ?? request.id,
        };
      },
    });

    return approval;
  }

  async deny({
    workspaceId,
    requestId,
    now = new Date(),
  }: Readonly<{
    workspaceId: string;
    requestId: string;
    now?: Date;
  }>): Promise<AgentActionApprovalRequestEntity> {
    return this.dataSource.transaction(async (manager) => {
      const requestRepository = manager.getRepository(
        AgentActionApprovalRequestEntity,
      );
      const request = await requestRepository.findOne({
        where: {
          id: requestId,
          workspaceId,
          status: 'PENDING',
          approvalId: IsNull(),
          expiresAt: MoreThan(now),
        },
        lock: { mode: 'pessimistic_write' },
      });

      if (request === null) {
        throw new Error('Approval request is missing, expired, or resolved.');
      }

      const updateResult = await requestRepository.update(
        { id: request.id, workspaceId, status: 'PENDING' },
        { status: 'DENIED' },
      );

      if (updateResult.affected !== 1) {
        throw new Error('Approval request changed concurrently.');
      }

      return requestRepository.create({ ...request, status: 'DENIED' });
    });
  }

  private isUniqueViolation(error: unknown): boolean {
    return isPlainObject(error) && error.code === '23505';
  }
}
