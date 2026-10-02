import { Injectable, Logger } from '@nestjs/common';

import { isDefined, isValidUuid } from 'twenty-shared/utils';
import { In } from 'typeorm';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { WorkflowVersionCoreSyncService } from 'src/engine/core-modules/workflow/services/workflow-version-core-sync.service';
import { CommandMenuItemService } from 'src/engine/metadata-modules/command-menu-item/command-menu-item.service';
import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import {
  LogicFunctionException,
  LogicFunctionExceptionCode,
} from 'src/engine/metadata-modules/logic-function/logic-function.exception';
import { LogicFunctionFromSourceService } from 'src/engine/metadata-modules/logic-function/services/logic-function-from-source.service';
import { type FlatLogicFunction } from 'src/engine/metadata-modules/logic-function/types/flat-logic-function.type';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { type WorkspaceRepository } from 'src/engine/twenty-orm/repository/workspace-repository';
import { type ScopedRolePermissionConfig } from 'src/engine/core-modules/policy/types/policy-context.type';
import {
  type ObjectMetadataInfo,
  WorkflowMetadataReadService,
} from 'src/modules/workflow/common/workspace-services/workflow-metadata-read.workspace-service';
import { type WorkflowAutomatedTriggerWorkspaceEntity } from 'src/modules/workflow/common/standard-objects/workflow-automated-trigger.workspace-entity';
import { type WorkflowRunWorkspaceEntity } from 'src/modules/workflow/common/standard-objects/workflow-run.workspace-entity';
import {
  WorkflowVersionStatus,
  type WorkflowVersionWorkspaceEntity,
} from 'src/modules/workflow/common/standard-objects/workflow-version.workspace-entity';
import {
  WorkflowStatus,
  type WorkflowWorkspaceEntity,
} from 'src/modules/workflow/common/standard-objects/workflow.workspace-entity';
import {
  WorkflowTriggerException,
  WorkflowTriggerExceptionCode,
} from 'src/modules/workflow/workflow-trigger/exceptions/workflow-trigger.exception';
import { getWorkflowCommandMenuItemLabel } from 'src/modules/workflow/workflow-trigger/utils/get-workflow-command-menu-item-label.util';
import { WorkflowActionType } from 'twenty-shared/workflow';

export type { ObjectMetadataInfo };

@Injectable()
export class WorkflowCommonWorkspaceService {
  private readonly logger = new Logger(WorkflowCommonWorkspaceService.name);

  constructor(
    private readonly workspaceOrmManager: WorkspaceOrmManager,
    private readonly logicFunctionFromSourceService: LogicFunctionFromSourceService,
    private readonly workflowMetadataReadService: WorkflowMetadataReadService,
    private readonly commandMenuItemService: CommandMenuItemService,
    private readonly workflowVersionCoreSyncService: WorkflowVersionCoreSyncService,
  ) {}

  async getWorkflowVersionOrFail({
    workspaceId,
    workflowVersionId,
    rolePermissionConfig,
    authContext: suppliedAuthContext,
  }: {
    workspaceId: string;
    workflowVersionId: string;
    rolePermissionConfig?: ScopedRolePermissionConfig;
    authContext?: WorkspaceAuthContext;
  }): Promise<WorkflowVersionWorkspaceEntity> {
    if (!workflowVersionId) {
      throw new WorkflowTriggerException(
        'Workflow version ID is required',
        WorkflowTriggerExceptionCode.INVALID_INPUT,
      );
    }

    const authContext = suppliedAuthContext ?? getWorkspaceAuthContext();
    const resolvedRolePermissionConfig =
      rolePermissionConfig ??
      (await this.workspaceOrmManager.resolveRolePermissionConfigForAuthContext(
        authContext,
      ));

    if (
      authContext.workspace.id !== workspaceId ||
      resolvedRolePermissionConfig === null ||
      'shouldBypassPermissionChecks' in resolvedRolePermissionConfig
    ) {
      throw new WorkflowTriggerException(
        'Workflow authority is unresolved or not scoped to the workspace',
        WorkflowTriggerExceptionCode.FORBIDDEN,
      );
    }

    return this.workspaceOrmManager.executeInWorkspaceContext(async () => {
      const workflowVersionRepository =
        this.workspaceOrmManager.getRepository<WorkflowVersionWorkspaceEntity>(
          'workflowVersion',
          resolvedRolePermissionConfig,
        );

      const workflowVersion = await workflowVersionRepository.findOne({
        where: {
          id: workflowVersionId,
        },
      });

      const validWorkflowVersion =
        await this.getValidWorkflowVersionOrFail(workflowVersion);

      return this.overlayCoreWorkflowVersionContent(
        workspaceId,
        validWorkflowVersion,
      );
    }, authContext);
  }

  private async overlayCoreWorkflowVersionContent(
    workspaceId: string,
    workflowVersion: WorkflowVersionWorkspaceEntity,
  ): Promise<WorkflowVersionWorkspaceEntity> {
    if (!isDefined(workflowVersion.coreWorkflowVersionId)) {
      return workflowVersion;
    }

    const coreWorkflowVersion =
      await this.workflowVersionCoreSyncService.findCoreVersionById(
        workspaceId,
        workflowVersion.coreWorkflowVersionId,
      );

    if (!isDefined(coreWorkflowVersion)) {
      return workflowVersion;
    }

    return {
      ...workflowVersion,
      trigger: coreWorkflowVersion.triggers?.[0] ?? null,
      steps: coreWorkflowVersion.steps,
      status: coreWorkflowVersion.status as unknown as WorkflowVersionStatus,
    };
  }

  async getValidWorkflowVersionOrFail(
    workflowVersion: WorkflowVersionWorkspaceEntity | null,
  ): Promise<WorkflowVersionWorkspaceEntity> {
    if (!workflowVersion) {
      throw new WorkflowTriggerException(
        'Workflow version not found',
        WorkflowTriggerExceptionCode.INVALID_INPUT,
      );
    }

    return { ...workflowVersion, trigger: workflowVersion.trigger };
  }

  async syncCommandMenuItemLabelForWorkflows(
    workflowIds: string[],
    authContext: WorkspaceAuthContext,
  ): Promise<void> {
    const workspaceId = authContext.workspace?.id;

    if (!isDefined(workspaceId) || workflowIds.length === 0) {
      return;
    }

    const { rolePermissionConfig } = await this.resolveScopedAuthority(
      workspaceId,
      authContext,
    );

    const workflows = await this.workspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const workflowRepository =
          this.workspaceOrmManager.getRepository<WorkflowWorkspaceEntity>(
            'workflow',
            rolePermissionConfig,
          );

        return workflowRepository.find({
          where: { id: In(workflowIds) },
        });
      },
      authContext,
    );

    await Promise.all(
      workflows.map((workflow) =>
        this.syncCommandMenuItemLabelForWorkflow(workflow, workspaceId),
      ),
    );
  }

  private async syncCommandMenuItemLabelForWorkflow(
    workflow: WorkflowWorkspaceEntity,
    workspaceId: string,
  ): Promise<void> {
    if (!isDefined(workflow.lastPublishedVersionId)) {
      return;
    }

    const existingCommandMenuItem =
      await this.commandMenuItemService.findByWorkflowVersionId(
        workflow.lastPublishedVersionId,
        workspaceId,
      );

    if (!isDefined(existingCommandMenuItem)) {
      return;
    }

    const label = getWorkflowCommandMenuItemLabel(workflow);

    if (
      existingCommandMenuItem.label === label &&
      existingCommandMenuItem.shortLabel === label
    ) {
      return;
    }

    await this.commandMenuItemService.update(
      {
        id: existingCommandMenuItem.id,
        label,
        shortLabel: label,
      },
      workspaceId,
    );
  }

  async getFlatEntityMaps(workspaceId: string): Promise<{
    flatObjectMetadataMaps: FlatEntityMaps<FlatObjectMetadata>;
    flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata>;
    objectIdByNameSingular: Record<string, string>;
  }> {
    return this.workflowMetadataReadService.getFlatEntityMaps(workspaceId);
  }

  async getLogicFunctionById({
    logicFunctionId,
    workspaceId,
  }: {
    logicFunctionId: string;
    workspaceId: string;
  }): Promise<FlatLogicFunction | undefined> {
    return this.workflowMetadataReadService.getLogicFunctionById({
      logicFunctionId,
      workspaceId,
    });
  }

  async getObjectMetadataInfo(
    objectNameSingular: string,
    workspaceId: string,
  ): Promise<ObjectMetadataInfo> {
    return this.workflowMetadataReadService.getObjectMetadataInfo(
      objectNameSingular,
      workspaceId,
    );
  }

  async handleWorkflowSubEntities({
    workflowIds,
    workspaceId,
    operation,
  }: {
    workflowIds: string[];
    workspaceId: string;
    operation: 'restore' | 'delete' | 'destroy';
  }): Promise<void> {
    const { authContext, rolePermissionConfig } =
      await this.resolveScopedAuthority(workspaceId);

    await this.workspaceOrmManager.executeInWorkspaceContext(async () => {
      const workflowVersionRepository =
        this.workspaceOrmManager.getRepository<WorkflowVersionWorkspaceEntity>(
          'workflowVersion',
          rolePermissionConfig,
        );

      const workflowRunRepository =
        this.workspaceOrmManager.getRepository<WorkflowRunWorkspaceEntity>(
          'workflowRun',
          rolePermissionConfig,
        );

      const workflowAutomatedTriggerRepository =
        this.workspaceOrmManager.getRepository<WorkflowAutomatedTriggerWorkspaceEntity>(
          'workflowAutomatedTrigger',
          rolePermissionConfig,
        );

      for (const workflowId of workflowIds) {
        switch (operation) {
          case 'delete':
            await workflowAutomatedTriggerRepository.softDelete({
              workflowId,
            });

            await workflowRunRepository.softDelete({
              workflowId,
            });

            await workflowVersionRepository.softDelete({
              workflowId,
            });

            await this.workflowVersionCoreSyncService.deleteCoreVersionsByWorkflowIds(
              workspaceId,
              [workflowId],
            );

            break;
          case 'restore':
            await workflowAutomatedTriggerRepository.restore({
              workflowId,
            });

            await workflowRunRepository.restore({
              workflowId,
            });

            await workflowVersionRepository.restore({
              workflowId,
            });

            await this.workflowVersionCoreSyncService.recreateCoreVersionsByWorkflowId(
              workspaceId,
              workflowId,
            );

            break;
        }

        await this.deactivateVersionOnDelete({
          workflowVersionRepository,
          workflowId,
          workspaceId,
          operation,
          rolePermissionConfig,
        });

        await this.handleLogicFunctionSubEntities({
          workflowVersionRepository,
          workflowId,
          workspaceId,
          operation,
        });
      }
    }, authContext);
  }

  private async deactivateVersionOnDelete({
    workflowVersionRepository,
    workflowId,
    workspaceId,
    operation,
    rolePermissionConfig,
  }: {
    workflowVersionRepository: WorkspaceRepository<WorkflowVersionWorkspaceEntity>;
    workspaceId: string;
    workflowId: string;
    operation: 'restore' | 'delete' | 'destroy';
    rolePermissionConfig: ScopedRolePermissionConfig;
  }) {
    if (operation !== 'delete') {
      return;
    }

    const workflowVersions = await workflowVersionRepository.find({
      where: { workflowId },
      withDeleted: true,
    });

    await this.workspaceOrmManager.runInWorkspaceTransaction(
      async ({ getRepository }) => {
        const workflowRepository = getRepository<WorkflowWorkspaceEntity>(
          'workflow',
          rolePermissionConfig,
        );
        const transactionalWorkflowVersionRepository =
          getRepository<WorkflowVersionWorkspaceEntity>(
            'workflowVersion',
            rolePermissionConfig,
          );

        const workflow = await workflowRepository.findOne({
          where: { id: workflowId },
          withDeleted: true,
        });

        if (workflow?.statuses?.includes(WorkflowStatus.ACTIVE)) {
          const newStatuses = [
            ...workflow.statuses.filter(
              (status) => status !== WorkflowStatus.ACTIVE,
            ),
            WorkflowStatus.DEACTIVATED,
          ];

          await workflowRepository.update(workflowId, {
            statuses: newStatuses,
          });
        }

        for (const workflowVersion of workflowVersions) {
          if (workflowVersion.status === WorkflowVersionStatus.ACTIVE) {
            await transactionalWorkflowVersionRepository.update(
              workflowVersion.id,
              { status: WorkflowVersionStatus.DEACTIVATED },
            );
          }
        }
      },
    );

    for (const workflowVersion of workflowVersions) {
      if (workflowVersion.status === WorkflowVersionStatus.ACTIVE) {
        await this.cleanupCommandMenuItemForVersion(
          workflowVersion.id,
          workspaceId,
        );
      }
    }

    await this.workflowVersionCoreSyncService.invalidateAutomatedTriggerMaps(
      workspaceId,
    );
  }

  private async cleanupCommandMenuItemForVersion(
    workflowVersionId: string,
    workspaceId: string,
  ) {
    const existingCommandMenuItem =
      await this.commandMenuItemService.findByWorkflowVersionId(
        workflowVersionId,
        workspaceId,
      );

    if (isDefined(existingCommandMenuItem)) {
      await this.commandMenuItemService.delete(
        existingCommandMenuItem.id,
        workspaceId,
      );
    }
  }

  private async resolveScopedAuthority(
    workspaceId: string,
    suppliedAuthContext?: WorkspaceAuthContext,
  ): Promise<{
    authContext: WorkspaceAuthContext;
    rolePermissionConfig: ScopedRolePermissionConfig;
  }> {
    const authContext = suppliedAuthContext ?? getWorkspaceAuthContext();
    const rolePermissionConfig =
      await this.workspaceOrmManager.resolveRolePermissionConfigForAuthContext(
        authContext,
      );

    if (
      authContext.workspace.id !== workspaceId ||
      rolePermissionConfig === null ||
      'shouldBypassPermissionChecks' in rolePermissionConfig
    ) {
      throw new WorkflowTriggerException(
        'Workflow authority is unresolved or not scoped to the workspace',
        WorkflowTriggerExceptionCode.FORBIDDEN,
      );
    }

    return { authContext, rolePermissionConfig };
  }

  async handleLogicFunctionSubEntities({
    workflowVersionRepository,
    workflowId,
    workspaceId,
    operation,
  }: {
    workflowVersionRepository: WorkspaceRepository<WorkflowVersionWorkspaceEntity>;
    workflowId: string;
    workspaceId: string;
    operation: 'restore' | 'delete' | 'destroy';
  }) {
    // Only handle destroy operation - soft delete/restore is no longer supported
    if (operation !== 'destroy') {
      return;
    }

    const workflowVersions = await workflowVersionRepository.find({
      where: {
        workflowId,
      },
      withDeleted: true,
    });

    for (const workflowVersion of workflowVersions) {
      for (const step of workflowVersion.steps ?? []) {
        if (step.type === WorkflowActionType.CODE) {
          const logicFunctionId = step.settings.input.logicFunctionId;

          if (!isValidUuid(logicFunctionId)) {
            this.logger.warn(
              `Skipping destroy for CODE step with undefined logicFunctionId in workflow ${workflowId}`,
            );
            continue;
          }

          await this.logicFunctionFromSourceService
            .deleteOneWithSource({
              id: logicFunctionId,
              workspaceId,
            })
            .catch((error) => {
              if (
                error instanceof LogicFunctionException &&
                error.code ===
                  LogicFunctionExceptionCode.LOGIC_FUNCTION_NOT_FOUND
              ) {
                return;
              }

              throw error;
            });
        }
      }
    }
  }
}
