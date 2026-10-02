import { PermissionFlagType } from 'twenty-shared/constants';

import { LogicFunctionToolProvider } from 'src/engine/core-modules/tool-provider/providers/logic-function-tool.provider';

describe('LogicFunctionToolProvider', () => {
  it('requires current code-execution permission before exposing functions', async () => {
    const permissionsService = { hasToolPermission: jest.fn() };
    const provider = new LogicFunctionToolProvider(
      {} as never,
      permissionsService as never,
    );
    const context = {
      workspaceId: '11111111-1111-4111-8111-111111111111',
      roleId: '22222222-2222-4222-8222-222222222222',
      rolePermissionConfig: {
        unionOf: ['22222222-2222-4222-8222-222222222222'],
      },
    };

    permissionsService.hasToolPermission.mockResolvedValue(false);

    await expect(provider.isAvailable(context as never)).resolves.toBe(false);
    expect(permissionsService.hasToolPermission).toHaveBeenCalledWith(
      context.rolePermissionConfig,
      context.workspaceId,
      PermissionFlagType.CODE_INTERPRETER_TOOL,
    );
  });
});
