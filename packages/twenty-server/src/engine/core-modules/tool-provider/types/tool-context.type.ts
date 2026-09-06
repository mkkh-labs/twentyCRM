import { type ActorMetadata } from 'twenty-shared/types';
import { type APP_LOCALES } from 'twenty-shared/translations';

import { type CodeExecutionStreamEmitter } from 'src/engine/core-modules/tool-provider/interfaces/code-execution-stream-emitter.type';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type ScopedRolePermissionConfig } from 'src/engine/core-modules/policy/types/policy-context.type';

export type ToolContext = {
  workspaceId: string;
  roleId: string;
  rolePermissionConfig?: ScopedRolePermissionConfig;
  authContext?: WorkspaceAuthContext;
  actorContext?: ActorMetadata;
  userId?: string;
  userWorkspaceId?: string;
  threadId?: string;
  locale?: keyof typeof APP_LOCALES;
  onCodeExecutionUpdate?: CodeExecutionStreamEmitter;
  serviceAuthorityId?: string;
  rootCorrelationId?: string;
  jobId?: string;
  workflowRunId?: string;
  workflowStepId?: string;
  mutationOrEffectId?: string;
  approvalId?: string;
  automationAllowed?: boolean;
  objectMetadataId?: string;
  recordIds?: readonly string[];
  affectedFieldMetadataIds?: readonly string[];
};
