import { Injectable } from '@nestjs/common';

import { type ToolCategory } from 'twenty-shared/ai';

import { type ToolExecutionRef } from 'src/engine/core-modules/tool-provider/types/tool-execution-ref.type';
import { WorkflowToolEffectService } from 'src/engine/core-modules/workflow-reliability/services/workflow-tool-effect.service';
import { type ToolOutput } from 'src/engine/core-modules/tool/types/tool-output.type';
import { type WorkflowExecutionContext } from 'src/modules/workflow/workflow-executor/types/workflow-execution-context.type';
import { type WorkflowRunInfo } from 'src/modules/workflow/workflow-executor/types/workflow-action-input';

@Injectable()
export class WorkflowActionEffectService {
  constructor(
    private readonly workflowToolEffectService: WorkflowToolEffectService,
  ) {}

  execute({
    actionInput,
    category,
    description,
    executionContext,
    executionRef,
    name,
    providerClass,
    roleAllowed,
    runInfo,
    stepId,
    execute,
  }: Readonly<{
    actionInput: Readonly<Record<string, unknown>>;
    category: ToolCategory;
    description: string;
    executionContext: WorkflowExecutionContext;
    executionRef: ToolExecutionRef;
    name: string;
    providerClass: string;
    roleAllowed: boolean;
    runInfo: WorkflowRunInfo;
    stepId: string;
    execute: () => Promise<ToolOutput>;
  }>): Promise<ToolOutput> {
    return this.workflowToolEffectService.execute({
      workspaceId: runInfo.workspaceId,
      workflowRunId: runInfo.workflowRunId,
      stepId,
      providerClass,
      actionInput,
      descriptor: {
        name,
        label: name,
        description,
        category,
        executionRef,
      },
      policyContext: {
        workspaceId: runInfo.workspaceId,
        roleId: executionContext.roleId,
        rolePermissionConfig: executionContext.rolePermissionConfig,
        authContext: executionContext.authContext,
        actorContext: executionContext.initiator,
        rootCorrelationId: runInfo.rootCorrelationId ?? runInfo.workflowRunId,
        jobId: runInfo.jobId,
        workflowRunId: runInfo.workflowRunId,
        workflowStepId: stepId,
        approvalId: runInfo.approvalId,
        automationAllowed: true,
      },
      roleAllowed,
      execute,
    });
  }
}
