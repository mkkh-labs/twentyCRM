import { Scope } from '@nestjs/common';

import { isDefined, isValidUuid } from 'twenty-shared/utils';
import { StepStatus } from 'twenty-shared/workflow';

import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { buildApplicationAuthContext } from 'src/engine/core-modules/auth/utils/build-application-auth-context.util';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { type MessageQueueJobContext } from 'src/engine/core-modules/message-queue/interfaces/message-queue-job.interface';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { fromWorkspaceEntityToFlat } from 'src/engine/core-modules/workspace/utils/from-workspace-entity-to-flat.util';
import { WorkflowRunStatus } from 'src/modules/workflow/common/standard-objects/workflow-run.workspace-entity';
import { RESUME_DELAYED_WORKFLOW_JOB_NAME } from 'src/modules/workflow/workflow-executor/workflow-actions/delay/contants/resume-delayed-workflow-job-name';
import { isWorkflowDelayAction } from 'src/modules/workflow/workflow-executor/workflow-actions/delay/guards/is-workflow-delay-action.guard';
import { ResumeDelayedWorkflowJobData } from 'src/modules/workflow/workflow-executor/workflow-actions/delay/types/resume-delayed-workflow-job-data.type';
import {
  WorkflowRunException,
  WorkflowRunExceptionCode,
} from 'src/modules/workflow/workflow-runner/exceptions/workflow-run.exception';
import { RunWorkflowJob } from 'src/modules/workflow/workflow-runner/jobs/run-workflow.job';
import { type RunWorkflowJobData } from 'src/modules/workflow/workflow-runner/types/run-workflow-job-data.type';
import { buildRunWorkflowJobOptions } from 'src/modules/workflow/workflow-runner/utils/build-run-workflow-job-options.util';
import { WorkflowRunWorkspaceService } from 'src/modules/workflow/workflow-runner/workflow-run/workflow-run.workspace-service';

@Processor({
  queueName: MessageQueue.delayedJobsQueue,
  scope: Scope.REQUEST,
})
export class ResumeDelayedWorkflowJob {
  constructor(
    private readonly applicationService: ApplicationService,
    @InjectMessageQueue(MessageQueue.workflowQueue)
    private readonly messageQueueService: MessageQueueService,
    private readonly workflowRunWorkspaceService: WorkflowRunWorkspaceService,
    private readonly workspaceOrmManager: WorkspaceOrmManager,
  ) {}

  @Process(RESUME_DELAYED_WORKFLOW_JOB_NAME)
  async handle(
    {
      workspaceId,
      workflowRunId,
      stepId,
      policySchemaVersion,
      rootCorrelationId,
      originPolicyDecisionId,
      approvalId,
    }: ResumeDelayedWorkflowJobData,
    jobContext: MessageQueueJobContext,
  ): Promise<void> {
    if (
      !isDefined(jobContext?.jobId) ||
      jobContext.jobName !== RESUME_DELAYED_WORKFLOW_JOB_NAME ||
      policySchemaVersion !== 1 ||
      !isValidUuid(rootCorrelationId)
    ) {
      throw new WorkflowRunException(
        'Protected delayed workflow job identity is missing or mismatched.',
        WorkflowRunExceptionCode.WORKFLOW_RUN_INVALID,
      );
    }

    const { application, workspace } =
      await this.applicationService.findTwentyStandardApplicationOrThrow(
        workspaceId,
      );
    const roleId = await this.applicationService.findApplicationRoleId(
      application.id,
      workspaceId,
    );
    const authContext = buildApplicationAuthContext({
      workspace: fromWorkspaceEntityToFlat(workspace),
      application: { ...application, defaultRoleId: roleId },
    });

    await this.workspaceOrmManager.executeInWorkspaceContext(async () => {
      try {
        const workflowRun =
          await this.workflowRunWorkspaceService.getWorkflowRunOrFail({
            workflowRunId,
            workspaceId,
          });

        if (workflowRun.status !== WorkflowRunStatus.RUNNING) {
          return;
        }

        const step = workflowRun.state?.flow?.steps?.find(
          (step) => step.id === stepId,
        );

        const stepInfo = workflowRun.state?.stepInfos[stepId];

        if (!step || !isWorkflowDelayAction(step)) {
          throw new WorkflowRunException(
            'Step not found or is not a delay action',
            WorkflowRunExceptionCode.INVALID_OPERATION,
          );
        }

        if (stepInfo?.status !== StepStatus.PENDING) {
          throw new WorkflowRunException(
            'Step is not pending',
            WorkflowRunExceptionCode.INVALID_OPERATION,
          );
        }

        await this.workflowRunWorkspaceService.updateWorkflowRunStepInfo({
          stepId,
          stepInfo: {
            status: StepStatus.SUCCESS,
            result: {
              success: true,
            },
          },
          workspaceId,
          workflowRunId,
        });

        await this.messageQueueService.add<RunWorkflowJobData>(
          RunWorkflowJob.name,
          {
            workspaceId,
            workflowRunId,
            policySchemaVersion: 1,
            rootCorrelationId,
            originPolicyDecisionId,
            approvalId,
            lastExecutedStepId: stepId,
          },
          buildRunWorkflowJobOptions(workflowRunId),
        );
      } catch (error) {
        await this.workflowRunWorkspaceService.endWorkflowRun({
          workflowRunId,
          workspaceId,
          status: WorkflowRunStatus.FAILED,
          error:
            error instanceof Error
              ? error.message
              : `Error during delay resume: ${String(error)}`,
          isSystemError: true,
        });

        throw error;
      }
    }, authContext);
  }
}
