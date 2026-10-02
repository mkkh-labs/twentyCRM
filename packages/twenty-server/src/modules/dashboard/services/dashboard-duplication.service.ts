import { Injectable, Logger } from '@nestjs/common';

import { appendCopySuffix, isDefined } from 'twenty-shared/utils';

import { ActorFromAuthContextService } from 'src/engine/core-modules/actor/services/actor-from-auth-context.service';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import {
  PermissionsException,
  PermissionsExceptionCode,
  PermissionsExceptionMessage,
} from 'src/engine/metadata-modules/permissions/permissions.exception';
import { PageLayoutDuplicationService } from 'src/engine/metadata-modules/page-layout/services/page-layout-duplication.service';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { WorkspaceRepository } from 'src/engine/twenty-orm/repository/workspace-repository';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { type RolePermissionConfig } from 'src/engine/twenty-orm/types/role-permission-config';
import { getObjectsPermissionsFromRolePermissionConfig } from 'src/engine/twenty-orm/utils/get-objects-permissions-from-role-permission-config.util';
import { DuplicatedDashboardDTO } from 'src/modules/dashboard/dtos/duplicated-dashboard.dto';
import {
  DashboardException,
  DashboardExceptionCode,
  DashboardExceptionMessageKey,
  generateDashboardExceptionMessage,
} from 'src/modules/dashboard/exceptions/dashboard.exception';
import { DashboardWorkspaceEntity } from 'src/modules/dashboard/standard-objects/dashboard.workspace-entity';

@Injectable()
export class DashboardDuplicationService {
  private readonly logger = new Logger(DashboardDuplicationService.name);

  constructor(
    private readonly pageLayoutDuplicationService: PageLayoutDuplicationService,
    private readonly workspaceOrmManager: WorkspaceOrmManager,
    private readonly actorFromAuthContextService: ActorFromAuthContextService,
  ) {}

  async duplicateDashboard(
    dashboardId: string,
    authContext: WorkspaceAuthContext,
  ): Promise<DuplicatedDashboardDTO> {
    const workspace = authContext.workspace;
    const workspaceId = workspace.id;

    return this.workspaceOrmManager.executeInWorkspaceContext(async () => {
      const rolePermissionConfig =
        await this.workspaceOrmManager.resolveRolePermissionConfigForAuthContext(
          authContext,
        );

      if (
        !isDefined(rolePermissionConfig) ||
        'shouldBypassPermissionChecks' in rolePermissionConfig
      ) {
        this.throwPermissionDenied();
      }

      this.validateDuplicationPermissionOrThrow(rolePermissionConfig);

      const dashboardRepository =
        this.workspaceOrmManager.getRepository<DashboardWorkspaceEntity>(
          'dashboard',
          rolePermissionConfig,
        );

      const originalDashboard = await dashboardRepository.findOne({
        where: { id: dashboardId },
      });

      if (!isDefined(originalDashboard)) {
        throw new DashboardException(
          generateDashboardExceptionMessage(
            DashboardExceptionMessageKey.DASHBOARD_NOT_FOUND,
            dashboardId,
          ),
          DashboardExceptionCode.DASHBOARD_NOT_FOUND,
        );
      }

      if (!isDefined(originalDashboard.pageLayoutId)) {
        throw new DashboardException(
          generateDashboardExceptionMessage(
            DashboardExceptionMessageKey.PAGE_LAYOUT_NOT_FOUND,
            dashboardId,
          ),
          DashboardExceptionCode.PAGE_LAYOUT_NOT_FOUND,
        );
      }

      try {
        const newPageLayout = await this.pageLayoutDuplicationService.duplicate(
          {
            pageLayoutId: originalDashboard.pageLayoutId,
            workspaceId,
          },
        );

        const newDashboard = await this.createDuplicatedDashboard(
          originalDashboard,
          newPageLayout.id,
          dashboardRepository,
          authContext,
        );

        return {
          id: newDashboard.id,
          title: newDashboard.title,
          pageLayoutId: newDashboard.pageLayoutId,
          position: newDashboard.position,
          createdAt: newDashboard.createdAt,
          updatedAt: newDashboard.updatedAt,
        };
      } catch (error) {
        this.logger.error(
          `Failed to duplicate dashboard ${dashboardId}: ${error.message}`,
          error.stack,
        );

        throw error;
      }
    }, authContext);
  }

  private validateDuplicationPermissionOrThrow(
    rolePermissionConfig: RolePermissionConfig,
  ): void {
    const { objectIdByNameSingular, permissionsPerRoleId } =
      getWorkspaceContext();
    const dashboardObjectMetadataId = objectIdByNameSingular.dashboard;
    const dashboardPermission = isDefined(dashboardObjectMetadataId)
      ? getObjectsPermissionsFromRolePermissionConfig({
          rolesPermissions: permissionsPerRoleId,
          rolePermissionConfig,
        })[dashboardObjectMetadataId]
      : undefined;
    const restrictedFieldPermissions = Object.values(
      dashboardPermission?.restrictedFields ?? {},
    ).filter(isDefined);
    const canDuplicate =
      dashboardPermission?.canReadObjectRecords === true &&
      dashboardPermission.canUpdateObjectRecords === true &&
      restrictedFieldPermissions.every(
        (fieldPermission) =>
          fieldPermission.canRead !== false &&
          fieldPermission.canUpdate !== false,
      ) &&
      dashboardPermission.rowLevelPermissionPredicates.length === 0 &&
      dashboardPermission.rowLevelPermissionPredicateGroups.length === 0;

    if (!canDuplicate) {
      this.throwPermissionDenied();
    }
  }

  private throwPermissionDenied(): never {
    throw new PermissionsException(
      PermissionsExceptionMessage.PERMISSION_DENIED,
      PermissionsExceptionCode.PERMISSION_DENIED,
    );
  }

  private async createDuplicatedDashboard(
    originalDashboard: DashboardWorkspaceEntity,
    newPageLayoutId: string,
    dashboardRepository: WorkspaceRepository<DashboardWorkspaceEntity>,
    authContext: WorkspaceAuthContext,
  ): Promise<DashboardWorkspaceEntity> {
    const newTitle = appendCopySuffix(originalDashboard.title ?? '');

    const [recordWithActor] =
      await this.actorFromAuthContextService.injectActorFieldsOnCreate({
        records: [
          {
            title: newTitle,
            pageLayoutId: newPageLayoutId,
            position: originalDashboard.position,
          },
        ],
        objectMetadataNameSingular: 'dashboard',
        authContext,
      });

    const insertResult = await dashboardRepository.insert(recordWithActor);

    const newDashboardId = insertResult.identifiers[0].id;

    const newDashboard = await dashboardRepository.findOne({
      where: { id: newDashboardId },
    });

    if (!isDefined(newDashboard)) {
      throw new DashboardException(
        generateDashboardExceptionMessage(
          DashboardExceptionMessageKey.DASHBOARD_DUPLICATION_FAILED,
          'Failed to retrieve created dashboard',
        ),
        DashboardExceptionCode.DASHBOARD_DUPLICATION_FAILED,
      );
    }

    return newDashboard;
  }
}
