import { Injectable } from '@nestjs/common';

import { type WorkflowRunStepLog } from 'twenty-shared/workflow';

import { CreateCalendarEventTool } from 'src/engine/core-modules/tool/tools/calendar-tool/create-calendar-event-tool';
import { type ToolOutput } from 'src/engine/core-modules/tool/types/tool-output.type';
import { type Tool } from 'src/engine/core-modules/tool/types/tool.type';
import { WorkflowToolEffectService } from 'src/engine/core-modules/workflow-reliability/services/workflow-tool-effect.service';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';
import { WorkflowExecutionContextService } from 'src/modules/workflow/workflow-executor/services/workflow-execution-context.service';
import {
  WorkflowStepExecutorException,
  WorkflowStepExecutorExceptionCode,
} from 'src/modules/workflow/workflow-executor/exceptions/workflow-step-executor.exception';
import { isWorkflowCreateCalendarEventAction } from 'src/modules/workflow/workflow-executor/workflow-actions/create-calendar-event/guards/is-workflow-create-calendar-event-action.guard';
import { type WorkflowCreateCalendarEventActionInput } from 'src/modules/workflow/workflow-executor/workflow-actions/create-calendar-event/types/workflow-create-calendar-event-action-input.type';
import { buildCreateCalendarEventStepLog } from 'src/modules/workflow/workflow-executor/workflow-actions/create-calendar-event/utils/build-create-calendar-event-step-log.util';
import { ToolBackedWorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/tool-backed/tool-backed.workflow-action';
import { type WorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/types/workflow-action.type';
import { WorkflowRunStepLogWorkspaceService } from 'src/modules/workflow/workflow-runner/workflow-run/workflow-run-step-log.workspace-service';

@Injectable()
export class CreateCalendarEventWorkflowAction extends ToolBackedWorkflowAction<WorkflowCreateCalendarEventActionInput> {
  constructor(
    private readonly createCalendarEventTool: CreateCalendarEventTool,
    workflowRunStepLogService: WorkflowRunStepLogWorkspaceService,
    workflowToolEffectService: WorkflowToolEffectService,
    workflowExecutionContextService: WorkflowExecutionContextService,
    permissionsService: PermissionsService,
  ) {
    super(
      CreateCalendarEventWorkflowAction.name,
      'create_calendar_event',
      workflowRunStepLogService,
      workflowToolEffectService,
      workflowExecutionContextService,
      permissionsService,
    );
  }

  protected getTool(): Tool {
    return this.createCalendarEventTool;
  }

  protected assertStep(step: WorkflowAction): void {
    if (!isWorkflowCreateCalendarEventAction(step)) {
      throw new WorkflowStepExecutorException(
        'Step is not a create-calendar-event action',
        WorkflowStepExecutorExceptionCode.INVALID_STEP_TYPE,
      );
    }
  }

  protected buildStepLog({
    input,
    output,
    durationMs,
  }: {
    input: WorkflowCreateCalendarEventActionInput;
    output: ToolOutput;
    durationMs: number;
  }): WorkflowRunStepLog {
    return buildCreateCalendarEventStepLog({ input, output, durationMs });
  }
}
