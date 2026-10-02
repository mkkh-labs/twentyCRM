import { isDefined } from 'twenty-shared/utils';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type DashboardToolContext } from 'src/modules/dashboard/tools/types/dashboard-tool-dependencies.type';

export const getRequiredDashboardToolAuthContext = (
  context: DashboardToolContext,
): WorkspaceAuthContext => {
  if (
    !isDefined(context.authContext) ||
    context.authContext.workspace.id !== context.workspaceId
  ) {
    throw new Error('Valid workspace-bound dashboard authority is required');
  }

  return context.authContext;
};
