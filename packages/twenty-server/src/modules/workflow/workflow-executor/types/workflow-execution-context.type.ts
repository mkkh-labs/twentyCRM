import { type ActorMetadata } from 'twenty-shared/types';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type ScopedRolePermissionConfig } from 'src/engine/core-modules/policy/types/policy-context.type';

export type WorkflowExecutionContext = {
  isActingOnBehalfOfUser: boolean;
  initiator: ActorMetadata;
  roleId: string;
  rolePermissionConfig: ScopedRolePermissionConfig;
  authContext: WorkspaceAuthContext;
};
