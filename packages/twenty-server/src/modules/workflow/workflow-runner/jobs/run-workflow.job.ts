import { Logger, Scope } from '@nestjs/common';

import { isDefined, isValidUuid } from 'twenty-shared/utils';

import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { buildApplicationAuthContext } from 'src/engine/core-modules/auth/utils/build-application-auth-context.util';
import { type ApplicationWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type MessageQueueJobContext } from 'src/engine/core-modules/message-queue/interfaces/message-queue-job.interface';
import { MetricsService } from 'src/engine/core-modules/metrics/metrics.service';
import { MetricsKeys } from 'src/engine/core-modules/metrics/types/metrics-keys.type';
import { type ScopedRolePermissionConfig } from 'src/engine/core-modules/policy/types/policy-context.type';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { fromWorkspaceEntityToFlat } from 'src/engine/core-modules/workspace/utils/from-workspace-entity-to-flat.util';
import { WorkflowRunStatus } from 'src/modules/workflow/common/standard-objects/workflow-run.workspace-entity';
import { WorkflowCommonWorkspaceService } from 'src/modules/workflow/common/workspace-services/workflow-common.workspace-service';
import { CodeStepBuildService } from 'src/modules/workflow/workflow-builder/workflow-version-step/code-step/services/code-step-build.service';
import { WorkflowExecutorWorkspaceService } from 'src/modules/workflow/workflow-executor/workspace-services/workflow-executor.workspace-service';
import { RUN_WORKFLOW_JOB_NAME } from 'src/modules/workflow/workflow-runner/constants/run-workflow-job-name';
import {
  WorkflowRunException,
  WorkflowRunExceptionCode,
} from 'src/modules/workflow/workflow-runner/exceptions/workflow-run.exception';
import { type RunWorkflowJobData } from 'src/modules/workflow/workflow-runner/types/run-workflow-job-data.type';
import { validateRunWorkflowJobData } from 'src/modules/workflow/workflow-runner/utils/validate-run-workflow-job-data.util';
import { WorkflowRunWorkspaceService } from 'src/modules/workflow/workflow-runner/workflow-run/workflow-run.workspace-service';
import { WorkflowTriggerType } from 'src/modules/workflow/workflow-trigger/types/workflow-trigger.type';

const isQueueIdentityBoundToWorkflowRun = (
  jobId: string,
  workflowRunId: string,
) => {
  const expectedPrefix = `${workflowRunId}-`;

  return (
    jobId.startsWith(expectedPrefix) &&
    isValidUuid(jobId.slice(expectedPrefix.length))
  );
};

@Processor({ queueName: MessageQueue.workflowQueue, scope: Scope.REQUEST })
export class RunWorkflowJob {
  private readonly logger = new Logger(RunWorkflowJob.name);

  constructor(
    private readonly applicationService: ApplicationService,
    private readonly workflowCommonWorkspaceService: WorkflowCommonWorkspaceService,
    private readonly codeStepBuildService: CodeStepBuildService,
    private readonly workflowExecutorWorkspaceService: WorkflowExecutorWorkspaceService,
    private readonly workflowRunWorkspaceService: WorkflowRunWorkspaceService,
    private readonly metricsService: MetricsService,
    private readonly workspaceOrmManager: WorkspaceOrmManager,
  ) {}

  @Process(RUN_WORKFLOW_JOB_NAME)
  async handle(
    data: RunWorkflowJobData,
    jobContext: MessageQueueJobContext,
  ): Promise<void> {
    if (!validateRunWorkflowJobData(data)) {
      throw new WorkflowRunException(
        'Protected workflow job envelope is invalid.',
        WorkflowRunExceptionCode.WORKFLOW_RUN_INVALID,
      );
    }

    const {
      workflowRunId,
      lastExecutedStepId,
      stepIdsToRetry,
      workspaceId,
      rootCorrelationId,
      originPolicyDecisionId,
      approvalId,
    } = data;

    if (
      !isDefined(jobContext?.jobId) ||
      jobContext.jobName !== RUN_WORKFLOW_JOB_NAME ||
      !isQueueIdentityBoundToWorkflowRun(jobContext.jobId, workflowRunId)
    ) {
      throw new WorkflowRunException(
        'Protected workflow job identity is missing or mismatched.',
        WorkflowRunExceptionCode.WORKFLOW_RUN_INVALID,
      );
    }

    this.logger.log(
      `Running workflow run ${workflowRunId} in workspace ${workspaceId}`,
    );
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
    const rolePermissionConfig: ScopedRolePermissionConfig = {
      unionOf: [roleId],
    };
    const policyTransportContext = {
      jobId: jobContext.jobId,
      rootCorrelationId,
      originPolicyDecisionId,
      approvalId,
    };

    await this.workspaceOrmManager.executeInWorkspaceContext(async () => {
      try {
        if (isDefined(stepIdsToRetry)) {
          await this.retryWorkflowExecution({
            workspaceId,
            workflowRunId,
            stepIdsToRetry,
            ...policyTransportContext,
          });
        } else if (lastExecutedStepId) {
          await this.resumeWorkflowExecution({
            workspaceId,
            workflowRunId,
            lastExecutedStepId,
            ...policyTransportContext,
          });
        } else {
          await this.startWorkflowExecution({
            workflowRunId,
            workspaceId,
            authContext,
            rolePermissionConfig,
            ...policyTransportContext,
          });
        }
      } catch (error) {
        await this.workflowRunWorkspaceService.endWorkflowRun({
          workspaceId,
          workflowRunId,
          status: WorkflowRunStatus.FAILED,
          error: error.message,
          isSystemError: true,
        });

        throw error;
      }
    }, authContext);
  }

  private async startWorkflowExecution({
    workflowRunId,
    workspaceId,
    authContext,
    rolePermissionConfig,
    jobId,
    rootCorrelationId,
    originPolicyDecisionId,
    approvalId,
  }: {
    workflowRunId: string;
    workspaceId: string;
    authContext: ApplicationWorkspaceAuthContext;
    rolePermissionConfig: ScopedRolePermissionConfig;
    jobId: string;
    rootCorrelationId: string;
    originPolicyDecisionId?: string;
    approvalId?: string;
  }): Promise<void> {
    const workflowRun =
      await this.workflowRunWorkspaceService.getWorkflowRunOrFail({
        workflowRunId,
        workspaceId,
      });

    if (
      workflowRun.status !== WorkflowRunStatus.ENQUEUED &&
      workflowRun.status !== WorkflowRunStatus.NOT_STARTED
    ) {
      return;
    }

    const workflowVersion =
      await this.workflowCommonWorkspaceService.getWorkflowVersionOrFail({
        workspaceId,
        workflowVersionId: workflowRun.workflowVersionId,
        authContext,
        rolePermissionConfig,
      });

    if (!workflowVersion.trigger || !workflowVersion.steps) {
      throw new WorkflowRunException(
        'Workflow version has no trigger or steps',
        WorkflowRunExceptionCode.WORKFLOW_RUN_INVALID,
      );
    }

    await this.codeStepBuildService.buildCodeStepsFromSourceForSteps({
      workspaceId,
      steps: workflowVersion.steps,
    });

    await this.workflowRunWorkspaceService.startWorkflowRun({
      workflowRunId,
      workspaceId,
    });

    await this.incrementTriggerMetrics({
      workflowRunId,
      triggerType: workflowVersion.trigger.type,
    });

    const stepIds = workflowVersion.trigger.nextStepIds ?? [];

    await this.workflowExecutorWorkspaceService.executeFromSteps({
      stepIds,
      workflowRunId,
      workspaceId,
      jobId,
      rootCorrelationId,
      originPolicyDecisionId,
      approvalId,
    });
  }

  private async retryWorkflowExecution({
    workflowRunId,
    stepIdsToRetry,
    workspaceId,
    jobId,
    rootCorrelationId,
    originPolicyDecisionId,
    approvalId,
  }: {
    workflowRunId: string;
    stepIdsToRetry: readonly string[];
    workspaceId: string;
    jobId: string;
    rootCorrelationId: string;
    originPolicyDecisionId?: string;
    approvalId?: string;
  }): Promise<void> {
    const workflowRun =
      await this.workflowRunWorkspaceService.getWorkflowRunOrFail({
        workflowRunId,
        workspaceId,
      });

    if (workflowRun.status !== WorkflowRunStatus.RUNNING) {
      return;
    }

    await this.workflowExecutorWorkspaceService.executeFromSteps({
      stepIds: [...stepIdsToRetry],
      workflowRunId,
      workspaceId,
      jobId,
      rootCorrelationId,
      originPolicyDecisionId,
      approvalId,
    });
  }

  private async resumeWorkflowExecution({
    workflowRunId,
    lastExecutedStepId,
    workspaceId,
    jobId,
    rootCorrelationId,
    originPolicyDecisionId,
    approvalId,
  }: {
    workflowRunId: string;
    lastExecutedStepId: string;
    workspaceId: string;
    jobId: string;
    rootCorrelationId: string;
    originPolicyDecisionId?: string;
    approvalId?: string;
  }): Promise<void> {
    const workflowRun =
      await this.workflowRunWorkspaceService.getWorkflowRunOrFail({
        workflowRunId,
        workspaceId,
      });

    if (workflowRun.status !== WorkflowRunStatus.RUNNING) {
      return;
    }

    const lastExecutedStep = workflowRun.state?.flow?.steps?.find(
      (step) => step.id === lastExecutedStepId,
    );

    if (!lastExecutedStep) {
      throw new WorkflowRunException(
        'Last executed step not found',
        WorkflowRunExceptionCode.INVALID_INPUT,
      );
    }

    const lastExecutedStepOutput =
      workflowRun.state?.stepInfos[lastExecutedStepId];

    const { nextStepIdsToExecute, nextStepIdsToSkip, nextStepIdsToFailSafely } =
      await this.workflowExecutorWorkspaceService.getNextStepIdsToExecute({
        executedStep: lastExecutedStep,
        executedStepOutput: lastExecutedStepOutput,
      });

    const hasStepsToSkipOrFailSafely =
      isDefined(nextStepIdsToSkip) || isDefined(nextStepIdsToFailSafely);

    const hasStepsToExecute =
      isDefined(nextStepIdsToExecute) && nextStepIdsToExecute.length > 0;

    if (!hasStepsToSkipOrFailSafely && !hasStepsToExecute) {
      await this.workflowRunWorkspaceService.endWorkflowRun({
        workflowRunId,
        workspaceId,
        status: WorkflowRunStatus.COMPLETED,
      });

      return;
    }

    const steps = workflowRun.state?.flow?.steps ?? [];

    if (hasStepsToSkipOrFailSafely) {
      await this.workflowExecutorWorkspaceService.skipAndFailSafelyStepsThenContinue(
        {
          stepIdsToSkip: nextStepIdsToSkip ?? [],
          stepIdsToFailSafely: nextStepIdsToFailSafely ?? [],
          steps,
          workflowRunId,
          workspaceId,
          executedStepsCount: 0,
          jobId,
          rootCorrelationId,
          originPolicyDecisionId,
          approvalId,
        },
      );
    }

    if (hasStepsToExecute) {
      await this.workflowExecutorWorkspaceService.executeFromSteps({
        stepIds: nextStepIdsToExecute,
        workflowRunId,
        workspaceId,
        jobId,
        rootCorrelationId,
        originPolicyDecisionId,
        approvalId,
      });
    }
  }

  private async incrementTriggerMetrics({
    workflowRunId,
    triggerType,
  }: {
    workflowRunId: string;
    triggerType: string;
  }) {
    let key: MetricsKeys;

    switch (triggerType) {
      case WorkflowTriggerType.DATABASE_EVENT:
        key = MetricsKeys.WorkflowRunStartedDatabaseEventTrigger;
        break;
      case WorkflowTriggerType.CRON:
        key = MetricsKeys.WorkflowRunStartedCronTrigger;
        break;
      case WorkflowTriggerType.WEBHOOK:
        key = MetricsKeys.WorkflowRunStartedWebhookTrigger;
        break;
      case WorkflowTriggerType.MANUAL:
        key = MetricsKeys.WorkflowRunStartedManualTrigger;
        break;
      default:
        throw new Error('Invalid trigger type');
    }

    await this.metricsService.incrementCounterForEvent({
      key,
      eventId: workflowRunId,
    });
  }
}
