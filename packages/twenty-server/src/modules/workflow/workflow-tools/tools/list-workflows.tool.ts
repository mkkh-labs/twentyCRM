import { z } from 'zod';

import {
  WorkflowStatus,
  type WorkflowWorkspaceEntity,
} from 'src/modules/workflow/common/standard-objects/workflow.workspace-entity';
import {
  type WorkflowToolAuthorizedContext,
  type WorkflowToolDependencies,
} from 'src/modules/workflow/workflow-tools/types/workflow-tool-dependencies.type';
import { getWorkflowToolAuthContext } from 'src/modules/workflow/workflow-tools/utils/get-workflow-tool-auth-context.util';

type ListWorkflowsToolContext = WorkflowToolAuthorizedContext;

const listWorkflowsSchema = z.object({
  status: z
    .nativeEnum(WorkflowStatus)
    .optional()
    .describe('Filter by status (DRAFT, ACTIVE, DEACTIVATED)'),
  limit: z.number().int().min(1).max(100).optional().default(50),
  offset: z.number().int().min(0).optional().default(0),
});

type ListWorkflowsInput = z.infer<typeof listWorkflowsSchema>;

export const createListWorkflowsTool = (
  deps: Pick<WorkflowToolDependencies, 'workspaceOrmManager'>,
  context: ListWorkflowsToolContext,
) => ({
  name: 'list_workflows' as const,
  description:
    'List all workflows in the workspace. Supports filtering by status and pagination.',
  inputSchema: listWorkflowsSchema,
  execute: async (parameters: ListWorkflowsInput) => {
    try {
      const authContext = getWorkflowToolAuthContext(context);

      return await deps.workspaceOrmManager.executeInWorkspaceContext(
        async () => {
          const workflowRepository =
            deps.workspaceOrmManager.getRepository<WorkflowWorkspaceEntity>(
              'workflow',
              context.rolePermissionConfig,
            );

          const queryBuilder =
            workflowRepository.createQueryBuilder('workflow');

          if (parameters.status) {
            queryBuilder.where(':status = ANY(workflow.statuses)', {
              status: parameters.status,
            });
          }

          queryBuilder
            .orderBy('workflow.createdAt', 'DESC')
            .take(parameters.limit)
            .skip(parameters.offset);

          const workflows =
            await queryBuilder.getMany<WorkflowWorkspaceEntity>();
          const totalCount = await queryBuilder.getCount();

          return {
            success: true,
            workflows: workflows.map((workflow) => ({
              id: workflow.id,
              name: workflow.name,
              statuses: workflow.statuses,
              lastPublishedVersionId: workflow.lastPublishedVersionId,
              createdAt: workflow.createdAt,
              updatedAt: workflow.updatedAt,
            })),
            totalCount,
          };
        },
        authContext,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return {
        success: false,
        error: errorMessage,
        message: `Failed to list workflows: ${errorMessage}`,
      };
    }
  },
});
