import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type WorkflowToolContext } from 'src/modules/workflow/workflow-tools/types/workflow-tool-dependencies.type';

export const getWorkflowToolAuthContext = (
  context: WorkflowToolContext,
): WorkspaceAuthContext => {
  if (context.authContext === undefined) {
    throw new Error('Workflow tool authority context is missing.');
  }

  if (context.authContext.workspace.id !== context.workspaceId) {
    throw new Error('Workflow tool authority belongs to another workspace.');
  }

  return context.authContext;
};
