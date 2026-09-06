import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { buildDeterministicDigest } from 'src/engine/core-modules/policy/utils/build-deterministic-digest.util';
import { ToolPolicyExecutionService } from 'src/engine/core-modules/tool-provider/services/tool-policy-execution.service';
import { type ResolvedToolProviderContext } from 'src/engine/core-modules/tool-provider/interfaces/tool-provider-context.type';
import { type ToolIndexEntry } from 'src/engine/core-modules/tool-provider/types/tool-index-entry.type';
import { WorkflowEffectService } from 'src/engine/core-modules/workflow-reliability/services/workflow-effect.service';
import { WorkflowProviderCapabilityRegistryService } from 'src/engine/core-modules/workflow-reliability/services/workflow-provider-capability-registry.service';
import { buildWorkflowEffectKey } from 'src/engine/core-modules/workflow-reliability/utils/build-workflow-effect-key.util';
import { type ToolOutput } from 'src/engine/core-modules/tool/types/tool-output.type';

@Injectable()
export class WorkflowToolEffectService {
  constructor(
    private readonly workflowEffectService: WorkflowEffectService,
    private readonly toolPolicyExecutionService: ToolPolicyExecutionService,
    private readonly workflowProviderCapabilityRegistryService: WorkflowProviderCapabilityRegistryService,
  ) {}

  async execute({
    workspaceId,
    workflowRunId,
    stepId,
    providerClass,
    actionInput,
    descriptor,
    policyContext,
    roleAllowed,
    execute,
  }: Readonly<{
    workspaceId: string;
    workflowRunId: string;
    stepId: string;
    providerClass: string;
    actionInput: Readonly<Record<string, unknown>>;
    descriptor: ToolIndexEntry;
    policyContext: ResolvedToolProviderContext;
    roleAllowed: boolean;
    execute: () => Promise<ToolOutput>;
  }>): Promise<ToolOutput> {
    this.workflowProviderCapabilityRegistryService.resolve(providerClass);

    const actionDigest = buildDeterministicDigest({
      providerClass,
      actionInput,
    });
    const effectKey = buildWorkflowEffectKey({
      workspaceId,
      workflowRunId,
      stepId,
      actionDigest,
    });
    const effectId = randomUUID();

    return this.toolPolicyExecutionService.execute({
      descriptor,
      arguments: { ...actionInput },
      context: {
        ...policyContext,
        workflowRunId,
        mutationOrEffectId: effectId,
      },
      roleAllowed,
      effect: () =>
        this.executeReservedEffect({
          workspaceId,
          workflowRunId,
          stepId,
          providerClass,
          actionDigest,
          effectKey,
          effectId,
          execute,
        }),
    });
  }

  private async executeReservedEffect({
    workspaceId,
    workflowRunId,
    stepId,
    providerClass,
    actionDigest,
    effectKey,
    effectId,
    execute,
  }: Readonly<{
    workspaceId: string;
    workflowRunId: string;
    stepId: string;
    providerClass: string;
    actionDigest: string;
    effectKey: string;
    effectId: string;
    execute: () => Promise<ToolOutput>;
  }>): Promise<ToolOutput> {
    const reservation = await this.workflowEffectService.reserve({
      id: effectId,
      workspaceId,
      effectKey,
      workflowRunId,
      stepId,
      actionDigest,
      providerClass,
    });

    if (reservation.status === 'DUPLICATE') {
      if (reservation.execution.state === 'SUCCEEDED') {
        return {
          success: true,
          message: 'Protected workflow effect already completed',
          result: { deduplicated: true },
        };
      }

      if (reservation.execution.state !== 'QUEUED') {
        return {
          success: false,
          message: 'Protected workflow effect requires reconciliation',
          error: `Effect ${reservation.execution.id} requires reconciliation before replay.`,
        };
      }
    }

    await this.workflowEffectService.transition({
      workspaceId,
      id: reservation.execution.id,
      from: 'QUEUED',
      to: 'RUNNING',
    });

    let output: ToolOutput;

    try {
      output = await execute();
    } catch (error) {
      await this.workflowEffectService.markOutcomeUncertain({
        workspaceId,
        id: reservation.execution.id,
        reason: 'PROVIDER_THROW_UNCERTAIN',
      });
      throw error;
    }

    if (!output.success) {
      await this.workflowEffectService.markOutcomeUncertain({
        workspaceId,
        id: reservation.execution.id,
        reason: 'PROVIDER_RESULT_UNCERTAIN',
      });

      return output;
    }

    await this.workflowEffectService.markSucceeded({
      workspaceId,
      id: reservation.execution.id,
      providerReference: output.result,
    });

    return output;
  }
}
