import { type CodeExecutionStreamEmitter } from 'src/engine/core-modules/tool-provider/interfaces/code-execution-stream-emitter.type';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type ScopedRolePermissionConfig } from 'src/engine/core-modules/policy/types/policy-context.type';

export type ToolExecutionContext = {
  workspaceId: string;
  userId?: string;
  userWorkspaceId?: string;
  threadId?: string;
  onCodeExecutionUpdate?: CodeExecutionStreamEmitter;
  authContext?: WorkspaceAuthContext;
  rolePermissionConfig?: ScopedRolePermissionConfig;
};
