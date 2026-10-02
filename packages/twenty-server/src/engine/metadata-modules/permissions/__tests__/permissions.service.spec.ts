import { PermissionFlagType } from 'twenty-shared/constants';

import { ApplicationExceptionCode } from 'src/engine/core-modules/application/application.exception';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';

describe('PermissionsService application authority', () => {
  it('denies a user-bound application whose default role is unresolved', async () => {
    const userRole = {
      id: 'user-role-id',
      canAccessAllTools: true,
      canUpdateAllSettings: true,
      rolePermissionFlags: [],
    };
    const applicationRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'application-id',
        workspaceId: 'workspace-id',
        defaultRoleId: null,
      }),
    };
    const roleRepository = { findOne: jest.fn() };
    const service = new PermissionsService(
      {
        getRolesByUserWorkspaces: jest
          .fn()
          .mockResolvedValue(new Map([['user-workspace-id', [userRole]]])),
      } as never,
      {} as never,
      {} as never,
      roleRepository as never,
      applicationRepository as never,
    );

    await expect(
      service.userHasWorkspaceSettingPermission({
        userWorkspaceId: 'user-workspace-id',
        workspaceId: 'workspace-id',
        applicationId: 'application-id',
        setting: PermissionFlagType.HTTP_REQUEST_TOOL,
      }),
    ).rejects.toMatchObject({
      code: ApplicationExceptionCode.APPLICATION_NOT_FOUND,
    });
    expect(roleRepository.findOne).not.toHaveBeenCalled();
  });
});
