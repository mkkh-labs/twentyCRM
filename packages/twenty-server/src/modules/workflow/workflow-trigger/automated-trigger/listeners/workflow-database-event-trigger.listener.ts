import { Injectable, Logger } from '@nestjs/common';

import {
  ObjectRecordEvent,
  type ObjectRecordCreateEvent,
  type ObjectRecordDeleteEvent,
  type ObjectRecordDestroyEvent,
  type ObjectRecordUpdateEvent,
  type ObjectRecordUpsertEvent,
} from 'twenty-shared/database-events';
import { type ObjectRecord } from 'twenty-shared/types';
import { isDefined, isNonEmptyArray, isValidUuid } from 'twenty-shared/utils';
import { TRIGGER_STEP_ID } from 'twenty-shared/workflow';

import { OnDatabaseBatchEvent } from 'src/engine/api/graphql/graphql-query-runner/decorators/on-database-batch-event.decorator';
import { DatabaseEventAction } from 'src/engine/api/graphql/graphql-query-runner/enums/database-event-action';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { isCachedDatabaseEventTrigger } from 'src/engine/core-modules/workflow/utils/cached-workflow-automated-trigger.util';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { type WorkspaceEventBatch } from 'src/engine/workspace-event-emitter/types/workspace-event-batch.type';
import { evaluateStepFilters } from 'src/modules/workflow/workflow-executor/workflow-actions/filter/utils/evaluate-step-filters.util';
import {
  type AutomatedTriggerSettings,
  type BaseDatabaseEventTriggerSettings,
  type UpdateEventTriggerSettings,
} from 'src/modules/workflow/workflow-trigger/automated-trigger/constants/automated-trigger-settings';
import { WorkflowTriggerJob } from 'src/modules/workflow/workflow-trigger/jobs/workflow-trigger.job';
import { WorkflowCommonWorkspaceService } from 'src/modules/workflow/common/workspace-services/workflow-common.workspace-service';
import { WorkflowServiceAuthorityWorkspaceService } from 'src/modules/workflow/common/workspace-services/workflow-service-authority.workspace-service';
import { type WorkflowTriggerJobData } from 'src/modules/workflow/workflow-trigger/types/workflow-trigger-job-data.type';
import { buildWorkflowDatabaseEventReference } from 'src/modules/workflow/workflow-trigger/utils/build-workflow-database-event-reference.util';
import { validateWorkflowDatabaseEventReference } from 'src/modules/workflow/workflow-trigger/utils/validate-workflow-database-event-reference.util';

type DatabaseEventTriggerListener = {
  workflowId: string;
  settings: AutomatedTriggerSettings;
};

type TriggerEvaluationArgs = {
  eventPayload: ObjectRecordEvent;
  eventListener: DatabaseEventTriggerListener;
  action: DatabaseEventAction;
};

@Injectable()
export class WorkflowDatabaseEventTriggerListener {
  private readonly logger = new Logger(
    WorkflowDatabaseEventTriggerListener.name,
  );

  constructor(
    @InjectMessageQueue(MessageQueue.workflowQueue)
    private readonly messageQueueService: MessageQueueService,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly workspaceOrmManager: WorkspaceOrmManager,
    private readonly workflowCommonWorkspaceService: WorkflowCommonWorkspaceService,
    private readonly workflowServiceAuthority: WorkflowServiceAuthorityWorkspaceService,
  ) {}

  @OnDatabaseBatchEvent('*', DatabaseEventAction.CREATED)
  async handleObjectRecordCreateEvent(
    payload: WorkspaceEventBatch<ObjectRecordCreateEvent>,
  ) {
    if (await this.shouldIgnoreEvent(payload)) {
      return;
    }

    await this.handleEvent({
      payload,
      action: DatabaseEventAction.CREATED,
    });
  }

  @OnDatabaseBatchEvent('*', DatabaseEventAction.UPDATED)
  async handleObjectRecordUpdateEvent(
    payload: WorkspaceEventBatch<ObjectRecordUpdateEvent>,
  ) {
    if (await this.shouldIgnoreEvent(payload)) {
      return;
    }

    await this.handleEvent({
      payload,
      action: DatabaseEventAction.UPDATED,
    });
  }

  @OnDatabaseBatchEvent('*', DatabaseEventAction.DELETED)
  async handleObjectRecordDeleteEvent(
    payload: WorkspaceEventBatch<ObjectRecordDeleteEvent>,
  ) {
    if (await this.shouldIgnoreEvent(payload)) {
      return;
    }

    await this.handleEvent({
      payload,
      action: DatabaseEventAction.DELETED,
    });
  }

  @OnDatabaseBatchEvent('*', DatabaseEventAction.DESTROYED)
  async handleObjectRecordDestroyEvent(
    payload: WorkspaceEventBatch<ObjectRecordDestroyEvent>,
  ) {
    if (await this.shouldIgnoreEvent(payload)) {
      return;
    }

    await this.handleEvent({
      payload,
      action: DatabaseEventAction.DESTROYED,
    });
  }

  @OnDatabaseBatchEvent('*', DatabaseEventAction.UPSERTED)
  async handleObjectRecordUpsertEvent(
    payload: WorkspaceEventBatch<ObjectRecordUpsertEvent>,
  ) {
    if (await this.shouldIgnoreEvent(payload)) {
      return;
    }

    await this.handleEvent({
      payload,
      action: DatabaseEventAction.UPSERTED,
    });
  }

  private async shouldIgnoreEvent(
    payload: WorkspaceEventBatch<ObjectRecordEvent>,
  ) {
    const workspaceId = payload.workspaceId;
    const databaseEventName = payload.name;

    if (
      !workspaceId ||
      !databaseEventName ||
      payload.objectMetadata?.workspaceId !== workspaceId
    ) {
      this.logger.error(
        `Denied database event with missing routing identity: workspacePresent=${Boolean(
          workspaceId,
        )} eventNamePresent=${Boolean(databaseEventName)} workspaceBound=${
          payload.objectMetadata?.workspaceId === workspaceId
        } eventCount=${payload.events?.length ?? 0}`,
      );

      return true;
    }

    return false;
  }

  private async handleEvent({
    payload,
    action,
  }: {
    payload: WorkspaceEventBatch<ObjectRecordEvent>;
    action: DatabaseEventAction;
  }) {
    const workspaceId = payload.workspaceId;
    const databaseEventName = payload.name;

    const eventListeners = await this.getDatabaseEventListeners(
      workspaceId,
      databaseEventName,
    );

    if (eventListeners.length === 0) {
      return;
    }

    let authority: Awaited<
      ReturnType<WorkflowServiceAuthorityWorkspaceService['resolve']>
    >;

    try {
      const { flatObjectMetadata } =
        await this.workflowCommonWorkspaceService.getObjectMetadataInfo(
          payload.objectMetadata.nameSingular,
          workspaceId,
        );

      if (flatObjectMetadata.id !== payload.objectMetadata.id) {
        this.logger.warn(
          `Denied workflow trigger for stale object metadata ${payload.objectMetadata.id}.`,
        );

        return;
      }

      authority = await this.workflowServiceAuthority.resolve(workspaceId);
    } catch (error) {
      this.logger.warn(
        `Denied workflow trigger ingress because scoped authority could not be resolved: ${
          error instanceof Error ? error.name : 'UnknownError'
        }`,
      );

      return;
    }

    await this.workspaceOrmManager.executeInWorkspaceContext(async () => {
      const recordRepository =
        this.workspaceOrmManager.getRepository<ObjectRecord>(
          payload.objectMetadata.nameSingular,
          authority.rolePermissionConfig,
        );

      for (const eventPayload of payload.events) {
        if (!isValidUuid(eventPayload.recordId)) {
          this.logger.warn(
            'Denied workflow trigger with malformed record identity.',
          );

          continue;
        }

        const listenersMatchingWatchedFields = eventListeners.filter(
          (eventListener) =>
            this.eventMatchesWatchedFields({
              eventPayload,
              eventListener,
              action,
            }),
        );

        if (listenersMatchingWatchedFields.length === 0) {
          continue;
        }

        const currentRecord = await recordRepository.findOneBy({
          id: eventPayload.recordId,
        });

        if (!isDefined(currentRecord)) {
          this.logger.warn(
            `Denied workflow trigger because record ${eventPayload.recordId} is unavailable to scoped authority.`,
          );

          continue;
        }

        const scopedEventPayload = {
          recordId: eventPayload.recordId,
          properties: {
            after: currentRecord,
            updatedFields:
              'updatedFields' in eventPayload.properties
                ? (eventPayload.properties.updatedFields ?? [])
                : [],
          },
        } as ObjectRecordEvent;

        for (const eventListener of listenersMatchingWatchedFields) {
          const shouldTriggerJob = this.eventMatchesRecordFilter({
            eventPayload: scopedEventPayload,
            eventListener,
          });

          if (!shouldTriggerJob) {
            continue;
          }

          if (
            action === DatabaseEventAction.DELETED ||
            action === DatabaseEventAction.DESTROYED
          ) {
            this.logger.warn(
              `Denied workflow trigger ${eventListener.workflowId}: deleted-record snapshots require scoped enqueue-time authority.`,
            );

            continue;
          }

          const databaseEvent = buildWorkflowDatabaseEventReference({
            workspaceId,
            workflowId: eventListener.workflowId,
            objectMetadataId: payload.objectMetadata.id,
            objectNameSingular: payload.objectMetadata.nameSingular,
            action,
            event: scopedEventPayload,
          });

          if (
            !validateWorkflowDatabaseEventReference(
              databaseEvent,
              workspaceId,
              eventListener.workflowId,
            )
          ) {
            this.logger.warn(
              `Denied malformed workflow trigger reference for workflow ${eventListener.workflowId}.`,
            );

            continue;
          }

          await this.messageQueueService.add<WorkflowTriggerJobData>(
            WorkflowTriggerJob.name,
            {
              triggerType: 'database-event',
              workspaceId,
              workflowId: eventListener.workflowId,
              databaseEvent,
            },
            { id: databaseEvent.idempotencyKey, retryLimit: 3 },
          );
        }
      }
    }, authority.authContext);
  }

  private async getDatabaseEventListeners(
    workspaceId: string,
    databaseEventName: string,
  ): Promise<DatabaseEventTriggerListener[]> {
    const { workflowAutomatedTriggerMaps } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'workflowAutomatedTriggerMaps',
      ]);

    return Object.values(workflowAutomatedTriggerMaps.byWorkflowId).filter(
      (trigger) =>
        isCachedDatabaseEventTrigger(trigger) &&
        trigger.settings.eventName === databaseEventName,
    );
  }

  private eventMatchesWatchedFields({
    eventPayload,
    eventListener,
    action,
  }: TriggerEvaluationArgs) {
    if (
      action === DatabaseEventAction.UPDATED ||
      action === DatabaseEventAction.UPSERTED
    ) {
      const settings = eventListener.settings as UpdateEventTriggerSettings;
      const updatedFields =
        (eventPayload as ObjectRecordUpdateEvent)?.properties?.updatedFields ??
        [];

      return (
        !settings.fields ||
        settings.fields.length === 0 ||
        settings.fields.some((field) => updatedFields.includes(field))
      );
    }

    return true;
  }

  private eventMatchesRecordFilter({
    eventPayload,
    eventListener,
  }: Pick<TriggerEvaluationArgs, 'eventPayload' | 'eventListener'>) {
    const { filter } =
      eventListener.settings as BaseDatabaseEventTriggerSettings;

    if (!isDefined(filter) || !isNonEmptyArray(filter.stepFilters)) {
      return true;
    }

    try {
      return evaluateStepFilters({
        stepFilters: filter.stepFilters,
        stepFilterGroups: filter.stepFilterGroups,
        context: { [TRIGGER_STEP_ID]: eventPayload },
      });
    } catch (error) {
      this.logger.error(
        `Failed to evaluate database-event trigger filter for workflow ${eventListener.workflowId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return false;
    }
  }
}
