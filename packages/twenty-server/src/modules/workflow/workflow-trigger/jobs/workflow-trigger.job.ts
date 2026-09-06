import { randomUUID } from 'node:crypto';

import { Logger, Scope } from '@nestjs/common';

import isEmpty from 'lodash.isempty';
import { FieldActorSource, type ObjectRecord } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { buildApplicationAuthContext } from 'src/engine/core-modules/auth/utils/build-application-auth-context.util';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { type MessageQueueJobRetryContext } from 'src/engine/core-modules/message-queue/interfaces/message-queue-job.interface';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { buildDeterministicDigest } from 'src/engine/core-modules/policy/utils/build-deterministic-digest.util';
import { WorkflowEffectService } from 'src/engine/core-modules/workflow-reliability/services/workflow-effect.service';
import { fromWorkspaceEntityToFlat } from 'src/engine/core-modules/workspace/utils/from-workspace-entity-to-flat.util';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { WorkflowVersionStatus } from 'src/modules/workflow/common/standard-objects/workflow-version.workspace-entity';
import { type WorkflowWorkspaceEntity } from 'src/modules/workflow/common/standard-objects/workflow.workspace-entity';
import { WorkflowCommonWorkspaceService } from 'src/modules/workflow/common/workspace-services/workflow-common.workspace-service';
import { WorkflowRunnerWorkspaceService } from 'src/modules/workflow/workflow-runner/workspace-services/workflow-runner.workspace-service';
import { WorkflowTriggerExceptionCode } from 'src/modules/workflow/workflow-trigger/exceptions/workflow-trigger.exception';
import { type WorkflowTriggerJobData } from 'src/modules/workflow/workflow-trigger/types/workflow-trigger-job-data.type';
import { validateWorkflowDatabaseEventReference } from 'src/modules/workflow/workflow-trigger/utils/validate-workflow-database-event-reference.util';
import { validateWorkflowTriggerJobData } from 'src/modules/workflow/workflow-trigger/utils/validate-workflow-trigger-job-data.util';

export type { WorkflowTriggerJobData } from 'src/modules/workflow/workflow-trigger/types/workflow-trigger-job-data.type';

const DEFAULT_WORKFLOW_NAME = 'Workflow';

@Processor({ queueName: MessageQueue.workflowQueue, scope: Scope.REQUEST })
export class WorkflowTriggerJob {
  private readonly logger = new Logger(WorkflowTriggerJob.name);

  constructor(
    private readonly applicationService: ApplicationService,
    private readonly workspaceOrmManager: WorkspaceOrmManager,
    private readonly workflowCommonWorkspaceService: WorkflowCommonWorkspaceService,
    private readonly workflowRunnerWorkspaceService: WorkflowRunnerWorkspaceService,
    private readonly workflowEffectService: WorkflowEffectService,
  ) {}

  @Process(WorkflowTriggerJob.name)
  async handle(
    data: WorkflowTriggerJobData,
    jobContext: MessageQueueJobRetryContext<WorkflowTriggerJobData>,
  ): Promise<void> {
    if (
      !isDefined(jobContext?.jobId) ||
      jobContext.jobName !== WorkflowTriggerJob.name
    ) {
      throw new Error('Protected workflow-trigger job identity is missing.');
    }

    if (!validateWorkflowTriggerJobData(data)) {
      throw new Error(
        'Workflow trigger payload is invalid; correlation identity is required.',
      );
    }

    const rootCorrelationId =
      data.triggerType === 'database-event'
        ? data.databaseEvent.rootCorrelationId
        : data.rootCorrelationId;

    const { application, workspace } =
      await this.applicationService.findTwentyStandardApplicationOrThrow(
        data.workspaceId,
      );
    const roleId = await this.applicationService.findApplicationRoleId(
      application.id,
      data.workspaceId,
    );
    const rolePermissionConfig = { unionOf: [roleId] };
    const authContext = buildApplicationAuthContext({
      workspace: fromWorkspaceEntityToFlat(workspace),
      application: { ...application, defaultRoleId: roleId },
    });

    await this.workspaceOrmManager.executeInWorkspaceContext(async () => {
      const workflowRepository =
        this.workspaceOrmManager.getRepository<WorkflowWorkspaceEntity>(
          'workflow',
          rolePermissionConfig,
        );
      const workflow = await workflowRepository.findOneBy({
        id: data.workflowId,
      });

      if (!workflow) {
        this.logger.error(
          `Workflow ${data.workflowId} not found in workspace ${data.workspaceId}`,
          WorkflowTriggerExceptionCode.NOT_FOUND,
        );

        return;
      }

      if (!workflow.lastPublishedVersionId) {
        this.logger.error(
          `Workflow ${data.workflowId} has no published version in workspace ${data.workspaceId}`,
          WorkflowTriggerExceptionCode.INTERNAL_ERROR,
        );

        return;
      }

      const workflowVersion =
        await this.workflowCommonWorkspaceService.getWorkflowVersionOrFail({
          workspaceId: data.workspaceId,
          workflowVersionId: workflow.lastPublishedVersionId,
          rolePermissionConfig,
          authContext,
        });

      if (workflowVersion.status !== WorkflowVersionStatus.ACTIVE) {
        this.logger.error(
          `Workflow version ${workflowVersion.id} is not active in workspace ${data.workspaceId}`,
          WorkflowTriggerExceptionCode.INTERNAL_ERROR,
        );

        return;
      }

      const payload =
        data.triggerType === 'database-event'
          ? await this.buildCurrentDatabaseEventPayload(
              data,
              rolePermissionConfig,
            )
          : data.payload;
      const effectKey =
        data.triggerType === 'database-event'
          ? data.databaseEvent.idempotencyKey
          : buildDeterministicDigest({
              jobId: jobContext.jobId,
              workspaceId: data.workspaceId,
              workflowId: data.workflowId,
            });
      const reservation = await this.workflowEffectService.reserve({
        id: randomUUID(),
        workspaceId: data.workspaceId,
        effectKey,
        workflowRunId: rootCorrelationId,
        stepId: 'workflow-trigger',
        actionDigest: buildDeterministicDigest({
          workflowVersionId: workflow.lastPublishedVersionId,
          payload,
        }),
        providerClass: 'workflow-runner',
      });
      const priorAttemptCount = reservation.execution.attemptCount ?? 0;

      if (reservation.status === 'DUPLICATE') {
        if (
          reservation.execution.state === 'SUCCEEDED' ||
          reservation.execution.state === 'RUNNING'
        ) {
          return;
        }

        if (reservation.execution.state === 'RETRY_WAIT') {
          await this.workflowEffectService.transition({
            workspaceId: data.workspaceId,
            id: reservation.execution.id,
            from: 'RETRY_WAIT',
            to: 'QUEUED',
          });
        } else if (reservation.execution.state !== 'QUEUED') {
          throw new Error('Workflow trigger cannot be safely replayed.');
        }
      }

      await this.workflowEffectService.transition({
        workspaceId: data.workspaceId,
        id: reservation.execution.id,
        from: 'QUEUED',
        to: 'RUNNING',
      });

      try {
        await this.workflowRunnerWorkspaceService.run({
          workspaceId: data.workspaceId,
          workflowVersionId: workflow.lastPublishedVersionId,
          workflowRunId: rootCorrelationId,
          payload,
          source: {
            source: FieldActorSource.WORKFLOW,
            name:
              isDefined(workflow.name) && !isEmpty(workflow.name)
                ? workflow.name
                : DEFAULT_WORKFLOW_NAME,
            context: {},
            workspaceMemberId: null,
          },
          authContext,
          rolePermissionConfig,
        });
        await this.workflowEffectService.transition({
          workspaceId: data.workspaceId,
          id: reservation.execution.id,
          from: 'RUNNING',
          to: 'SUCCEEDED',
        });
      } catch (error) {
        if (priorAttemptCount >= jobContext.retryLimit) {
          await this.workflowEffectService.markDeadLettered({
            workspaceId: data.workspaceId,
            id: reservation.execution.id,
            from: 'RUNNING',
            errorCode: 'WORKFLOW_TRIGGER_FAILED',
          });
        } else {
          await this.workflowEffectService.scheduleRetry({
            workspaceId: data.workspaceId,
            id: reservation.execution.id,
            retryAt: new Date(),
            errorCode: 'WORKFLOW_TRIGGER_FAILED',
          });
        }
        throw error;
      }
    }, authContext);
  }

  private async buildCurrentDatabaseEventPayload(
    data: Extract<WorkflowTriggerJobData, { triggerType: 'database-event' }>,
    rolePermissionConfig: { unionOf: string[] },
  ): Promise<object> {
    if (
      !validateWorkflowDatabaseEventReference(
        data.databaseEvent,
        data.workspaceId,
        data.workflowId,
      )
    ) {
      throw new Error('Workflow database-event reference is invalid or stale.');
    }

    const { flatObjectMetadata } =
      await this.workflowCommonWorkspaceService.getObjectMetadataInfo(
        data.databaseEvent.objectNameSingular,
        data.workspaceId,
      );

    if (flatObjectMetadata.id !== data.databaseEvent.objectMetadataId) {
      throw new Error('Workflow database-event object binding is stale.');
    }

    const recordRepository =
      this.workspaceOrmManager.getRepository<ObjectRecord>(
        data.databaseEvent.objectNameSingular,
        rolePermissionConfig,
      );
    const currentRecord = await recordRepository.findOneBy({
      id: data.databaseEvent.recordId,
    });

    if (!isDefined(currentRecord)) {
      throw new Error('Workflow database-event record is unavailable.');
    }

    return {
      recordId: data.databaseEvent.recordId,
      properties: {
        after: currentRecord,
        updatedFields: data.databaseEvent.updatedFields,
      },
    };
  }
}
