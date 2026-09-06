import { Injectable } from '@nestjs/common';

import { isPlainObject } from 'twenty-shared/utils';

import { WorkflowEffectExecutionEntity } from 'src/engine/core-modules/workflow-reliability/entities/workflow-effect-execution.entity';
import { type WorkflowExecutionState } from 'src/engine/core-modules/workflow-reliability/types/workflow-execution-state.type';
import { assertWorkflowExecutionTransition } from 'src/engine/core-modules/workflow-reliability/utils/assert-workflow-execution-transition.util';
import { buildDeterministicDigest } from 'src/engine/core-modules/policy/utils/build-deterministic-digest.util';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

export type ReserveWorkflowEffectInput = Readonly<{
  id: string;
  workspaceId: string;
  effectKey: string;
  workflowRunId: string;
  stepId: string;
  actionDigest: string;
  providerClass: string;
}>;

export type ReserveWorkflowEffectResult = Readonly<{
  status: 'RESERVED' | 'DUPLICATE';
  execution: WorkflowEffectExecutionEntity;
}>;

@Injectable()
export class WorkflowEffectService {
  constructor(
    @InjectWorkspaceScopedRepository(WorkflowEffectExecutionEntity)
    private readonly repository: WorkspaceScopedRepository<WorkflowEffectExecutionEntity>,
  ) {}

  async listRecent({
    workspaceId,
    limit,
  }: Readonly<{
    workspaceId: string;
    limit: number;
  }>): Promise<WorkflowEffectExecutionEntity[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error('Workflow operation list limit is invalid.');
    }

    return this.repository.find(workspaceId, {
      order: { updatedAt: 'DESC' },
      take: limit,
    });
  }

  async reserve(
    input: ReserveWorkflowEffectInput,
  ): Promise<ReserveWorkflowEffectResult> {
    try {
      const execution = await this.repository.insertAndReturnOne(
        input.workspaceId,
        {
          ...input,
          state: 'QUEUED',
          attemptCount: 0,
          retryAt: null,
          providerReferenceDigest: null,
          lastErrorCode: null,
          uncertaintyReason: null,
        },
      );

      return { status: 'RESERVED', execution };
    } catch (error) {
      if (!this.isUniqueViolation(error)) {
        throw error;
      }

      const existing = await this.repository.findOneBy(input.workspaceId, {
        effectKey: input.effectKey,
      });

      if (
        existing === null ||
        existing.workflowRunId !== input.workflowRunId ||
        existing.stepId !== input.stepId ||
        existing.actionDigest !== input.actionDigest ||
        existing.providerClass !== input.providerClass
      ) {
        throw new Error(
          'Workflow effect key is bound to different action evidence.',
        );
      }

      return { status: 'DUPLICATE', execution: existing };
    }
  }

  async transition({
    workspaceId,
    id,
    from,
    to,
  }: Readonly<{
    workspaceId: string;
    id: string;
    from: WorkflowExecutionState;
    to: WorkflowExecutionState;
  }>): Promise<void> {
    assertWorkflowExecutionTransition(from, to);

    const result = await this.repository.update(
      workspaceId,
      { id, state: from },
      { state: to },
    );

    if (result.affected !== 1) {
      throw new Error('Workflow effect transition lost a concurrent race.');
    }
  }

  async scheduleRetry({
    workspaceId,
    id,
    retryAt,
    errorCode,
  }: Readonly<{
    workspaceId: string;
    id: string;
    retryAt: Date;
    errorCode: string;
  }>): Promise<void> {
    const result = await this.repository.update(
      workspaceId,
      { id, state: 'RUNNING' },
      {
        state: 'RETRY_WAIT',
        retryAt,
        lastErrorCode: errorCode,
        attemptCount: () => '"attemptCount" + 1',
      },
    );

    if (result.affected !== 1) {
      throw new Error('Workflow effect retry lost a concurrent race.');
    }
  }

  async markOutcomeUncertain({
    workspaceId,
    id,
    reason,
  }: Readonly<{
    workspaceId: string;
    id: string;
    reason: string;
  }>): Promise<void> {
    const result = await this.repository.update(
      workspaceId,
      { id, state: 'RUNNING' },
      {
        uncertaintyReason: reason,
        lastErrorCode: 'EXTERNAL_OUTCOME_UNCERTAIN',
        attemptCount: () => '"attemptCount" + 1',
      },
    );

    if (result.affected !== 1) {
      throw new Error(
        'Workflow effect uncertainty marker lost a concurrent race.',
      );
    }
  }

  async markDeadLettered({
    workspaceId,
    id,
    from,
    errorCode,
  }: Readonly<{
    workspaceId: string;
    id: string;
    from: 'RUNNING' | 'RETRY_WAIT' | 'FAILED_PERMANENT';
    errorCode: string;
  }>): Promise<void> {
    assertWorkflowExecutionTransition(from, 'DEAD_LETTERED');

    const result = await this.repository.update(
      workspaceId,
      { id, state: from },
      {
        state: 'DEAD_LETTERED',
        retryAt: null,
        lastErrorCode: errorCode,
        ...(from === 'RUNNING'
          ? { attemptCount: () => '"attemptCount" + 1' }
          : {}),
      },
    );

    if (result.affected !== 1) {
      throw new Error('Workflow effect dead-letter transition lost a race.');
    }
  }

  async markSucceeded({
    workspaceId,
    id,
    providerReference,
  }: Readonly<{
    workspaceId: string;
    id: string;
    providerReference?: unknown;
  }>): Promise<void> {
    const result = await this.repository.update(
      workspaceId,
      { id, state: 'RUNNING' },
      {
        state: 'SUCCEEDED',
        providerReferenceDigest:
          providerReference === undefined
            ? null
            : buildDeterministicDigest(providerReference),
        lastErrorCode: null,
        uncertaintyReason: null,
        attemptCount: () => '"attemptCount" + 1',
      },
    );

    if (result.affected !== 1) {
      throw new Error('Workflow effect completion lost a concurrent race.');
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return isPlainObject(error) && error.code === '23505';
  }
}
