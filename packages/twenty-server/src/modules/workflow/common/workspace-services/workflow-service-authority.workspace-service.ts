import { Injectable } from '@nestjs/common';

import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { type ApplicationWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { buildApplicationAuthContext } from 'src/engine/core-modules/auth/utils/build-application-auth-context.util';
import { type ScopedRolePermissionConfig } from 'src/engine/core-modules/policy/types/policy-context.type';
import { fromWorkspaceEntityToFlat } from 'src/engine/core-modules/workspace/utils/from-workspace-entity-to-flat.util';

@Injectable()
export class WorkflowServiceAuthorityWorkspaceService {
  constructor(private readonly applicationService: ApplicationService) {}

  async resolve(workspaceId: string): Promise<{
    authContext: ApplicationWorkspaceAuthContext;
    rolePermissionConfig: ScopedRolePermissionConfig;
  }> {
    const { application, workspace } =
      await this.applicationService.findTwentyStandardApplicationOrThrow(
        workspaceId,
      );
    const roleId = await this.applicationService.findApplicationRoleId(
      application.id,
      workspaceId,
    );

    return {
      authContext: buildApplicationAuthContext({
        workspace: fromWorkspaceEntityToFlat(workspace),
        application: { ...application, defaultRoleId: roleId },
      }),
      rolePermissionConfig: { unionOf: [roleId] },
    };
  }
}
