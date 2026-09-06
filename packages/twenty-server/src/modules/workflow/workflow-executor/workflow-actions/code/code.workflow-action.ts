import { Injectable, Logger } from '@nestjs/common';

import { resolveInput } from 'twenty-shared/utils';
import { ToolCategory } from 'twenty-shared/ai';
import { PermissionFlagType } from 'twenty-shared/constants';

import { type WorkflowAction } from 'src/modules/workflow/workflow-executor/interfaces/workflow-action.interface';

import { type LogicFunctionExecuteResult } from 'src/engine/core-modules/logic-function/logic-function-drivers/interfaces/logic-function-driver.interface';
import { LogicFunctionExecutorService } from 'src/engine/core-modules/logic-function/logic-function-executor/logic-function-executor.service';
import { WorkflowExecutionContextService } from 'src/modules/workflow/workflow-executor/services/workflow-execution-context.service';
import { WorkflowActionEffectService } from 'src/modules/workflow/workflow-executor/services/workflow-action-effect.service';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';
import { getUserFromAuthContext } from 'src/modules/workflow/workflow-executor/utils/get-user-from-auth-context.util';
import {
  WorkflowStepExecutorException,
  WorkflowStepExecutorExceptionCode,
} from 'src/modules/workflow/workflow-executor/exceptions/workflow-step-executor.exception';
import { type WorkflowActionInput } from 'src/modules/workflow/workflow-executor/types/workflow-action-input';
import { type WorkflowActionOutput } from 'src/modules/workflow/workflow-executor/types/workflow-action-output.type';
import { findStepOrThrow } from 'src/modules/workflow/workflow-executor/utils/find-step-or-throw.util';
import { isWorkflowCodeAction } from 'src/modules/workflow/workflow-executor/workflow-actions/code/guards/is-workflow-code-action.guard';
import { type WorkflowCodeActionInput } from 'src/modules/workflow/workflow-executor/workflow-actions/code/types/workflow-code-action-input.type';
import { buildCodeStepLog } from 'src/modules/workflow/workflow-executor/workflow-actions/code/utils/build-code-step-log.util';
import { WorkflowRunStepLogWorkspaceService } from 'src/modules/workflow/workflow-runner/workflow-run/workflow-run-step-log.workspace-service';

@Injectable()
export class CodeWorkflowAction implements WorkflowAction {
  private readonly logger = new Logger(CodeWorkflowAction.name);

  constructor(
    private readonly logicFunctionExecutorService: LogicFunctionExecutorService,
    private readonly workflowExecutionContextService: WorkflowExecutionContextService,
    private readonly workflowRunStepLogService: WorkflowRunStepLogWorkspaceService,
    private readonly permissionsService: PermissionsService,
    private readonly workflowActionEffectService: WorkflowActionEffectService,
  ) {}

  async execute({
    currentStepId,
    steps,
    context,
    runInfo,
  }: WorkflowActionInput): Promise<WorkflowActionOutput> {
    const step = findStepOrThrow({
      stepId: currentStepId,
      steps,
    });

    if (!isWorkflowCodeAction(step)) {
      throw new WorkflowStepExecutorException(
        'Step is not a code action',
        WorkflowStepExecutorExceptionCode.INVALID_STEP_TYPE,
      );
    }

    const workflowActionInput = resolveInput(
      step.settings.input,
      context,
    ) as WorkflowCodeActionInput;

    const { workspaceId } = runInfo;

    const executionContext =
      await this.workflowExecutionContextService.getExecutionContext(runInfo);
    const roleAllowed = await this.permissionsService.hasToolPermission(
      executionContext.rolePermissionConfig,
      workspaceId,
      PermissionFlagType.CODE_INTERPRETER_TOOL,
    );

    const toolOutput = await this.workflowActionEffectService.execute({
      actionInput: {
        logicFunctionId: workflowActionInput.logicFunctionId,
        payload: workflowActionInput.logicFunctionInput,
      },
      category: ToolCategory.LOGIC_FUNCTION,
      description: 'Execute workflow code',
      executionContext,
      executionRef: {
        kind: 'logic_function',
        logicFunctionId: workflowActionInput.logicFunctionId,
      },
      name: 'workflow_code',
      providerClass: 'workflow-code',
      roleAllowed,
      runInfo,
      stepId: currentStepId,
      execute: async () => {
        const result = await this.logicFunctionExecutorService.execute({
          logicFunctionId: workflowActionInput.logicFunctionId,
          workspaceId,
          payload: workflowActionInput.logicFunctionInput,
          ...getUserFromAuthContext(executionContext.authContext),
        });

        return result.error
          ? {
              success: false,
              message: 'Workflow code execution failed',
              error: result.error.errorMessage,
            }
          : {
              success: true,
              message: 'Workflow code executed',
              result: result.data || {},
            };
      },
    });

    await this.persistStepLog({
      workflowRunId: runInfo.workflowRunId,
      workspaceId,
      stepId: currentStepId,
      result: toolOutput.success
        ? ({ data: toolOutput.result } as LogicFunctionExecuteResult)
        : ({
            error: { errorMessage: toolOutput.error },
          } as LogicFunctionExecuteResult),
    });

    if (!toolOutput.success) {
      return { error: toolOutput.error || toolOutput.message };
    }

    return { result: toolOutput.result || {} };
  }

  private async persistStepLog({
    workflowRunId,
    workspaceId,
    stepId,
    result,
  }: {
    workflowRunId: string;
    workspaceId: string;
    stepId: string;
    result: LogicFunctionExecuteResult;
  }): Promise<void> {
    try {
      await this.workflowRunStepLogService.setStepLog({
        workflowRunId,
        workspaceId,
        stepId,
        stepLog: buildCodeStepLog(result),
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
