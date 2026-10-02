import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isNonEmptyString } from '@sniptt/guards';
import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { isDefined, isNonEmptyArray } from 'twenty-shared/utils';
import { In, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import {
  WorkflowVersionEntity,
  WorkflowVersionStatus,
} from 'src/engine/core-modules/workflow/entities/workflow-version.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { type WorkspaceTransactionScope } from 'src/engine/twenty-orm/types/workspace-transaction-scope.type';
import { WorkspaceRepository } from 'src/engine/twenty-orm/repository/workspace-repository';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { escapeIdentifier } from 'src/engine/workspace-manager/workspace-migration/utils/remove-sql-injection.util';
import { type WorkflowVersionWorkspaceEntity } from 'src/modules/workflow/common/standard-objects/workflow-version.workspace-entity';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import {
  PolicyException,
  PolicyExceptionCode,
} from 'src/engine/core-modules/policy/policy.exception';
import { type ScopedRolePermissionConfig } from 'src/engine/core-modules/policy/types/policy-context.type';

@Injectable()
export class WorkflowVersionCoreSyncService {
  private readonly logger = new Logger(WorkflowVersionCoreSyncService.name);

  constructor(
    @InjectWorkspaceScopedRepository(WorkflowVersionEntity)
    private readonly coreWorkflowVersionRepository: WorkspaceScopedRepository<WorkflowVersionEntity>,
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    private readonly workspaceOrmManager: WorkspaceOrmManager,
    private readonly workspaceCacheService: WorkspaceCacheService,
  ) {}

  async upsertToCore(
    workspaceId: string,
    workflowVersions: WorkflowVersionWorkspaceEntity[],
  ): Promise<void> {
    if (workflowVersions.length === 0) {
      return;
    }

    const applicationId = await this.getCustomApplicationIdOrThrow(workspaceId);

    const linkedCoreVersionIds = await this.resolveOwnedCoreVersionIds(
      workspaceId,
      workflowVersions,
    );

    const coreVersionIdByWorkspaceRecordId = new Map<string, string>();

    const coreRows = workflowVersions.map((workflowVersion) => {
      const candidateCoreVersionId = workflowVersion.coreWorkflowVersionId;

      const linkedCoreVersionId =
        isNonEmptyString(candidateCoreVersionId) &&
        linkedCoreVersionIds.has(candidateCoreVersionId)
          ? candidateCoreVersionId
          : null;

      const coreWorkflowVersionId = linkedCoreVersionId ?? uuidv4();

      if (!isDefined(linkedCoreVersionId)) {
        coreVersionIdByWorkspaceRecordId.set(
          workflowVersion.id,
          coreWorkflowVersionId,
        );
      }

      return {
        id: coreWorkflowVersionId,
        workflowId: workflowVersion.workflowId,
        triggers: isDefined(workflowVersion.trigger)
          ? [workflowVersion.trigger]
          : null,
        steps: workflowVersion.steps ?? null,
        status: workflowVersion.status as unknown as WorkflowVersionStatus,
        universalIdentifier: uuidv4(),
        applicationId,
      };
    });

    await this.coreWorkflowVersionRepository.upsert(workspaceId, coreRows, [
      'id',
    ]);

    await this.writeBackCoreVersionIds(
      workspaceId,
      coreVersionIdByWorkspaceRecordId,
    );

    await this.invalidateAutomatedTriggerMaps(workspaceId);
  }

  // Same caller-writable column as coreWorkflowId, see WorkflowCoreSyncService.
  private async resolveOwnedCoreVersionIds(
    workspaceId: string,
    workflowVersions: WorkflowVersionWorkspaceEntity[],
  ): Promise<Set<string>> {
    const candidateIds = workflowVersions
      .map((workflowVersion) => workflowVersion.coreWorkflowVersionId)
      .filter(isNonEmptyString);

    if (candidateIds.length === 0) {
      return new Set();
    }

    const ownedRows = await this.coreWorkflowVersionRepository.find(
      workspaceId,
      {
        where: { id: In(candidateIds) },
        select: { id: true },
      },
    );

    return new Set(ownedRows.map((row) => row.id));
  }

  async deleteFromCore(
    workspaceId: string,
    coreWorkflowVersionIds: string[],
  ): Promise<void> {
    if (coreWorkflowVersionIds.length === 0) {
      return;
    }

    await this.coreWorkflowVersionRepository.delete(workspaceId, {
      id: In(coreWorkflowVersionIds),
    });

    await this.invalidateAutomatedTriggerMaps(workspaceId);
  }

  async findCoreVersionById(
    workspaceId: string,
    coreWorkflowVersionId: string,
  ): Promise<WorkflowVersionEntity | null> {
    return this.coreWorkflowVersionRepository.findOne(workspaceId, {
      where: { id: coreWorkflowVersionId },
    });
  }

  async mirrorWorkflowVersionWrite({
    workspaceId,
    transactionScope,
    workflowVersion,
    applicationId,
  }: {
    workspaceId: string;
    transactionScope: WorkspaceTransactionScope;
    workflowVersion: WorkflowVersionWorkspaceEntity;
    applicationId?: string;
  }): Promise<{ coreWorkflowVersionId: string } | null> {
    if (!(await this.workspaceHasCoreWorkflowVersionIdField(workspaceId))) {
      this.logger.warn(
        `workflowVersion.coreWorkflowVersionId field missing for workspace ${workspaceId}, skipping transactional core mirror`,
      );

      return null;
    }

    const resolvedApplicationId =
      applicationId ?? (await this.getCustomApplicationIdOrThrow(workspaceId));

    const candidateCoreVersionId = workflowVersion.coreWorkflowVersionId;

    const linkedCoreVersionId =
      isNonEmptyString(candidateCoreVersionId) &&
      (await this.isCoreVersionOwnedByWorkspace({
        coreWorkflowVersionId: candidateCoreVersionId,
        workspaceId,
        transactionScope,
      }))
        ? candidateCoreVersionId
        : null;

    const isNewLink = !isDefined(linkedCoreVersionId);
    const coreWorkflowVersionId = linkedCoreVersionId ?? uuidv4();

    // The conflict target is the primary key alone, so without the workspaceId
    // predicate a core row owned by another workspace would have its triggers
    // and steps overwritten.
    await transactionScope.executeRawQuery(
      `INSERT INTO core."workflowVersion"
         ("id", "workspaceId", "workflowId", "triggers", "steps", "status", "universalIdentifier", "applicationId")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT ("id") DO UPDATE SET
         "triggers" = EXCLUDED."triggers",
         "steps" = EXCLUDED."steps",
         "status" = EXCLUDED."status"
       WHERE core."workflowVersion"."workspaceId" = EXCLUDED."workspaceId"`,
      [
        coreWorkflowVersionId,
        workspaceId,
        workflowVersion.workflowId,
        isDefined(workflowVersion.trigger)
          ? JSON.stringify([workflowVersion.trigger])
          : null,
        isDefined(workflowVersion.steps)
          ? JSON.stringify(workflowVersion.steps)
          : null,
        workflowVersion.status,
        uuidv4(),
        resolvedApplicationId,
      ],
    );

    if (isNewLink) {
      await this.writeBackCoreVersionIdInTransaction(
        workspaceId,
        workflowVersion.id,
        coreWorkflowVersionId,
        transactionScope,
      );
    }

    return { coreWorkflowVersionId };
  }

  // Must run inside the caller's transaction so the ownership answer cannot go
  // stale before the insert below uses it.
  private async isCoreVersionOwnedByWorkspace({
    coreWorkflowVersionId,
    workspaceId,
    transactionScope,
  }: {
    coreWorkflowVersionId: string;
    workspaceId: string;
    transactionScope: WorkspaceTransactionScope;
  }): Promise<boolean> {
    const rows = await transactionScope.executeRawQuery(
      `SELECT 1 FROM core."workflowVersion" WHERE "id" = $1 AND "workspaceId" = $2`,
      [coreWorkflowVersionId, workspaceId],
    );

    return isNonEmptyArray(rows);
  }

  async mirrorWorkflowVersionWrites({
    workspaceId,
    transactionScope,
    workflowVersions,
  }: {
    workspaceId: string;
    transactionScope: WorkspaceTransactionScope;
    workflowVersions: WorkflowVersionWorkspaceEntity[];
  }): Promise<Map<string, string>> {
    const coreIdByWorkspaceRecordId = new Map<string, string>();

    if (workflowVersions.length === 0) {
      return coreIdByWorkspaceRecordId;
    }

    const applicationId = await this.getCustomApplicationIdOrThrow(workspaceId);

    for (const workflowVersion of workflowVersions) {
      const result = await this.mirrorWorkflowVersionWrite({
        workspaceId,
        transactionScope,
        workflowVersion,
        applicationId,
      });

      if (isDefined(result)) {
        coreIdByWorkspaceRecordId.set(
          workflowVersion.id,
          result.coreWorkflowVersionId,
        );
      }
    }

    return coreIdByWorkspaceRecordId;
  }

  async writeWorkflowVersionAndMirror(
    workspaceId: string,
    write: (
      workflowVersionRepository: WorkspaceRepository<WorkflowVersionWorkspaceEntity>,
      transactionScope: WorkspaceTransactionScope,
    ) => Promise<string>,
    authority?: Readonly<{
      authContext: WorkspaceAuthContext;
      rolePermissionConfig: ScopedRolePermissionConfig;
    }>,
  ): Promise<WorkflowVersionWorkspaceEntity | null> {
    const { authContext, rolePermissionConfig } =
      await this.resolveScopedAuthority(workspaceId, authority);

    const workflowVersion =
      await this.workspaceOrmManager.executeInWorkspaceContext(
        () =>
          this.workspaceOrmManager.runInWorkspaceTransaction(
            async (transactionScope) => {
              const workflowVersionRepository =
                transactionScope.getRepository<WorkflowVersionWorkspaceEntity>(
                  'workflowVersion',
                  rolePermissionConfig,
                );

              const workflowVersionId = await write(
                workflowVersionRepository,
                transactionScope,
              );

              const workflowVersion = await workflowVersionRepository.findOne({
                where: { id: workflowVersionId },
              });

              if (isDefined(workflowVersion)) {
                await this.mirrorWorkflowVersionWrite({
                  workspaceId,
                  transactionScope,
                  workflowVersion,
                });
              }

              return workflowVersion;
            },
          ),
        authContext,
      );

    await this.invalidateAutomatedTriggerMaps(workspaceId);

    return workflowVersion;
  }

  async deleteCoreVersionsByWorkflowIds(
    workspaceId: string,
    workflowIds: string[],
  ): Promise<void> {
    if (workflowIds.length === 0) {
      return;
    }

    await this.coreWorkflowVersionRepository.delete(workspaceId, {
      workflowId: In(workflowIds),
    });

    await this.invalidateAutomatedTriggerMaps(workspaceId);
  }

  async deleteCoreVersionsByWorkspaceVersionIds(
    workspaceId: string,
    workflowVersionIds: string[],
    authority?: Readonly<{
      authContext?: WorkspaceAuthContext;
      rolePermissionConfig?: ScopedRolePermissionConfig;
    }>,
  ): Promise<void> {
    if (workflowVersionIds.length === 0) {
      return;
    }

    const { authContext, rolePermissionConfig } =
      await this.resolveScopedAuthority(workspaceId, authority);

    const coreWorkflowVersionIds =
      await this.workspaceOrmManager.executeInWorkspaceContext(async () => {
        const workflowVersionRepository =
          this.workspaceOrmManager.getRepository<WorkflowVersionWorkspaceEntity>(
            'workflowVersion',
            rolePermissionConfig,
          );

        const versions = await workflowVersionRepository.find({
          where: { id: In(workflowVersionIds) },
          withDeleted: true,
        });

        return versions
          .map((version) => version.coreWorkflowVersionId)
          .filter(isNonEmptyString);
      }, authContext);

    await this.deleteFromCore(workspaceId, coreWorkflowVersionIds);
  }

  async recreateCoreVersionsByWorkflowId(
    workspaceId: string,
    workflowId: string,
    authority?: Readonly<{
      authContext?: WorkspaceAuthContext;
      rolePermissionConfig?: ScopedRolePermissionConfig;
    }>,
  ): Promise<void> {
    const { authContext, rolePermissionConfig } =
      await this.resolveScopedAuthority(workspaceId, authority);

    await this.workspaceOrmManager.executeInWorkspaceContext(async () => {
      const workflowVersionRepository =
        this.workspaceOrmManager.getRepository<WorkflowVersionWorkspaceEntity>(
          'workflowVersion',
          rolePermissionConfig,
        );

      const versions = await workflowVersionRepository.find({
        where: { workflowId },
      });

      await this.upsertToCore(workspaceId, versions);
    }, authContext);
  }

  private async resolveScopedAuthority(
    workspaceId: string,
    authority?: Readonly<{
      authContext?: WorkspaceAuthContext;
      rolePermissionConfig?: ScopedRolePermissionConfig;
    }>,
  ): Promise<{
    authContext: WorkspaceAuthContext;
    rolePermissionConfig: ScopedRolePermissionConfig;
  }> {
    const authContext = authority?.authContext ?? getWorkspaceAuthContext();
    const rolePermissionConfig =
      authority?.rolePermissionConfig ??
      (await this.workspaceOrmManager.resolveRolePermissionConfigForAuthContext(
        authContext,
      ));

    if (
      authContext.workspace.id !== workspaceId ||
      rolePermissionConfig === null ||
      'shouldBypassPermissionChecks' in rolePermissionConfig
    ) {
      throw new PolicyException(
        'Workflow authority is unresolved or not scoped to the workspace',
        PolicyExceptionCode.CONTEXT_INVALID,
      );
    }

    return { authContext, rolePermissionConfig };
  }

  private async writeBackCoreVersionIds(
    workspaceId: string,
    coreVersionIdByWorkspaceRecordId: Map<string, string>,
  ): Promise<void> {
    if (coreVersionIdByWorkspaceRecordId.size === 0) {
      return;
    }

    if (!(await this.workspaceHasCoreWorkflowVersionIdField(workspaceId))) {
      this.logger.warn(
        `workflowVersion.coreWorkflowVersionId field missing for workspace ${workspaceId}, skipping core id write-back`,
      );

      return;
    }

    await this.workspaceOrmManager.executeInWorkspaceContext(
      () =>
        this.workspaceOrmManager.runInWorkspaceTransaction(
          async (transactionScope) => {
            for (const [
              workspaceRecordId,
              coreWorkflowVersionId,
            ] of coreVersionIdByWorkspaceRecordId) {
              await this.writeBackCoreVersionIdInTransaction(
                workspaceId,
                workspaceRecordId,
                coreWorkflowVersionId,
                transactionScope,
              );
            }
          },
        ),
      buildSystemAuthContext(workspaceId),
    );
  }

  private async writeBackCoreVersionIdInTransaction(
    workspaceId: string,
    workflowVersionId: string,
    coreWorkflowVersionId: string,
    transactionScope: WorkspaceTransactionScope,
  ): Promise<void> {
    const workspaceSchemaName = escapeIdentifier(
      getWorkspaceSchemaName(workspaceId),
    );

    await transactionScope.executeRawQuery(
      `UPDATE ${workspaceSchemaName}."workflowVersion"
       SET "coreWorkflowVersionId" = $1
       WHERE "id" = $2`,
      [coreWorkflowVersionId, workflowVersionId],
    );
  }

  private async workspaceHasCoreWorkflowVersionIdField(
    workspaceId: string,
  ): Promise<boolean> {
    const { flatFieldMetadataMaps } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'flatFieldMetadataMaps',
      ]);

    return isDefined(
      flatFieldMetadataMaps.byUniversalIdentifier[
        STANDARD_OBJECTS.workflowVersion.fields.coreWorkflowVersionId
          .universalIdentifier
      ],
    );
  }

  private async getCustomApplicationIdOrThrow(
    workspaceId: string,
  ): Promise<string> {
    const workspace = await this.workspaceRepository.findOne({
      where: { id: workspaceId },
      select: ['id', 'workspaceCustomApplicationId'],
    });

    if (!isDefined(workspace?.workspaceCustomApplicationId)) {
      throw new Error(
        `Workspace custom application not found for workspace ${workspaceId}`,
      );
    }

    return workspace.workspaceCustomApplicationId;
  }

  async invalidateAutomatedTriggerMaps(workspaceId: string): Promise<void> {
    await this.workspaceCacheService.invalidateAndRecompute(workspaceId, [
      'workflowAutomatedTriggerMaps',
    ]);
  }
}
