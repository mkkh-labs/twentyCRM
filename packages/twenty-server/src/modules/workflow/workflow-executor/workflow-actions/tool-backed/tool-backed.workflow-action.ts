import { Logger } from '@nestjs/common';

import { type WorkflowRunStepLog } from 'twenty-shared/workflow';
import { ToolCategory } from 'twenty-shared/ai';
import {
  isDefined,
  resolveInput as resolveWorkflowInput,
} from 'twenty-shared/utils';

import { type ToolInput } from 'src/engine/core-modules/tool/types/tool-input.type';
import { type ToolExecutionContext } from 'src/engine/core-modules/tool/types/tool-execution-context.type';
import { type ToolOutput } from 'src/engine/core-modules/tool/types/tool-output.type';
import { type Tool } from 'src/engine/core-modules/tool/types/tool.type';
import { WorkflowToolEffectService } from 'src/engine/core-modules/workflow-reliability/services/workflow-tool-effect.service';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';
import { WorkflowExecutionContextService } from 'src/modules/workflow/workflow-executor/services/workflow-execution-context.service';
import { type WorkflowAction as WorkflowActionContract } from 'src/modules/workflow/workflow-executor/interfaces/workflow-action.interface';
import {
  type WorkflowActionInput,
  type WorkflowRunInfo,
} from 'src/modules/workflow/workflow-executor/types/workflow-action-input';
import { type WorkflowActionOutput } from 'src/modules/workflow/workflow-executor/types/workflow-action-output.type';
import { findStepOrThrow } from 'src/modules/workflow/workflow-executor/utils/find-step-or-throw.util';
import { type WorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/types/workflow-action.type';
import { WorkflowRunStepLogWorkspaceService } from 'src/modules/workflow/workflow-runner/workflow-run/workflow-run-step-log.workspace-service';

type BuildStepLogArgs<TInput> = {
  input: TInput;
  output: ToolOutput;
  durationMs: number;
};

export abstract class ToolBackedWorkflowAction<
  TInput extends ToolInput,
> implements WorkflowActionContract {
  protected readonly logger: Logger;

  protected constructor(
    private readonly providerClass: string,
    private readonly toolId: string,
    private readonly workflowRunStepLogService: WorkflowRunStepLogWorkspaceService,
    private readonly workflowToolEffectService: WorkflowToolEffectService,
    protected readonly workflowExecutionContextService: WorkflowExecutionContextService,
    private readonly permissionsService: PermissionsService,
  ) {
    this.logger = new Logger(providerClass);
  }

  protected abstract getTool(): Tool;

  protected abstract assertStep(step: WorkflowAction): void;

  protected async preprocessInput(
    rawInput: TInput,
    _context: Record<string, unknown>,
  ): Promise<TInput> {
    return rawInput;
  }

  protected async postprocessInput(
    resolvedInput: TInput,
    _runInfo: WorkflowRunInfo,
  ): Promise<TInput> {
    return resolvedInput;
  }

  protected resolveInput(
    input: TInput,
    context: Record<string, unknown>,
  ): TInput {
    return resolveWorkflowInput(input, context) as TInput;
  }

  protected abstract buildStepLog(
    args: BuildStepLogArgs<TInput>,
  ): WorkflowRunStepLog;

  protected async buildToolExecutionContext(
    runInfo: WorkflowRunInfo,
  ): Promise<ToolExecutionContext> {
    return { workspaceId: runInfo.workspaceId };
  }

  async execute({
    currentStepId,
    steps,
    context,
    runInfo,
  }: WorkflowActionInput): Promise<WorkflowActionOutput> {
    const step = findStepOrThrow({ stepId: currentStepId, steps });

    this.assertStep(step);

    const rawInput = step.settings.input as TInput;
    const preprocessed = await this.preprocessInput(rawInput, context);
    const resolvedInput = await this.postprocessInput(
      this.resolveInput(preprocessed, context),
      runInfo,
    );

    const startedAt = Date.now();
    const executionContext =
      await this.workflowExecutionContextService.getExecutionContext(runInfo);
    const tool = this.getTool();
    const roleAllowed = isDefined(tool.flag)
      ? await this.permissionsService.hasToolPermission(
          executionContext.rolePermissionConfig,
          runInfo.workspaceId,
          tool.flag,
        )
      : false;
    const toolExecutionContext = await this.buildToolExecutionContext(runInfo);
    const toolOutput = await this.workflowToolEffectService.execute({
      workspaceId: runInfo.workspaceId,
      workflowRunId: runInfo.workflowRunId,
      stepId: currentStepId,
      providerClass: this.providerClass,
      actionInput: resolvedInput,
      descriptor: {
        name: this.toolId,
        label: this.providerClass,
        description: tool.description,
        category: ToolCategory.ACTION,
        executionRef: { kind: 'static', toolId: this.toolId },
      },
      policyContext: {
        workspaceId: runInfo.workspaceId,
        roleId: executionContext.roleId,
        rolePermissionConfig: executionContext.rolePermissionConfig,
        authContext: executionContext.authContext,
        actorContext: executionContext.initiator,
        ...(executionContext.authContext.type === 'user'
          ? {
              userId: executionContext.authContext.user.id,
              userWorkspaceId: executionContext.authContext.userWorkspaceId,
            }
          : {}),
        rootCorrelationId: runInfo.rootCorrelationId ?? runInfo.workflowRunId,
        jobId: runInfo.jobId,
        workflowRunId: runInfo.workflowRunId,
        workflowStepId: currentStepId,
        approvalId: runInfo.approvalId,
        automationAllowed: true,
      },
      roleAllowed,
      execute: () => tool.execute(resolvedInput, toolExecutionContext),
    });
    const durationMs = Date.now() - startedAt;

    await this.persistStepLog({
      workflowRunId: runInfo.workflowRunId,
      workspaceId: runInfo.workspaceId,
      stepId: currentStepId,
      input: resolvedInput,
      output: toolOutput,
      durationMs,
    });

    return {
      result: toolOutput.result as object,
      error: toolOutput.error,
    };
  }

  private async persistStepLog({
    workflowRunId,
    workspaceId,
    stepId,
    input,
    output,
    durationMs,
  }: {
    workflowRunId: string;
    workspaceId: string;
    stepId: string;
    input: TInput;
    output: ToolOutput;
    durationMs: number;
  }): Promise<void> {
    try {
      await this.workflowRunStepLogService.setStepLog({
        workflowRunId,
        workspaceId,
        stepId,
        stepLog: this.buildStepLog({ input, output, durationMs }),
      });
    } catch (error) {
      this.logger.warn(
        `Failed to persist step log for workflowRun=${workflowRunId} step=${stepId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
