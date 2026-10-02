import { createDeleteWorkflowTool } from 'src/modules/workflow/workflow-tools/tools/delete-workflow.tool';

const WORKFLOW_ID = 'b3b8a4f0-0000-4000-8000-000000000000';
const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';

const buildTool = () => {
  const workflowRepository = {
    softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const workspaceOrmManager = {
    executeInWorkspaceContext: jest.fn((callback: () => unknown) => callback()),
    getRepository: jest.fn().mockReturnValue(workflowRepository),
  };
  const workflowCommonService = {
    handleWorkflowSubEntities: jest.fn().mockResolvedValue(undefined),
  };

  const tool = createDeleteWorkflowTool(
    {
      workspaceOrmManager,
      workflowCommonService,
    } as never,
    {
      workspaceId: WORKSPACE_ID,
      rolePermissionConfig: {
        unionOf: ['22222222-2222-4222-8222-222222222222'],
      },
      authContext: {
        type: 'application',
        workspace: { id: WORKSPACE_ID },
        application: { id: '33333333-3333-4333-8333-333333333333' },
      },
    } as never,
  );

  return {
    tool,
    workflowRepository,
    workspaceOrmManager,
    workflowCommonService,
  };
};

const baseInput = {
  workflowId: WORKFLOW_ID,
} as unknown as Parameters<
  ReturnType<typeof createDeleteWorkflowTool>['execute']
>[0];

describe('createDeleteWorkflowTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should soft delete the workflow and clean up sub-entities', async () => {
    const { tool, workflowRepository, workflowCommonService } = buildTool();

    const result = (await tool.execute(baseInput)) as Record<string, unknown>;

    expect(workflowRepository.softDelete).toHaveBeenCalledWith(WORKFLOW_ID);
    expect(
      workflowCommonService.handleWorkflowSubEntities,
    ).toHaveBeenCalledWith({
      workflowIds: [WORKFLOW_ID],
      workspaceId: WORKSPACE_ID,
      operation: 'delete',
    });
    expect(result.success).toBe(true);
    expect(result.workflowId).toBe(WORKFLOW_ID);
  });

  it('does not mutate when the workflow authority context is missing', async () => {
    const { workflowRepository } = buildTool();
    const contextlessTool = createDeleteWorkflowTool(
      {
        workspaceOrmManager: {
          executeInWorkspaceContext: jest.fn(),
          getRepository: jest.fn().mockReturnValue(workflowRepository),
        },
        workflowCommonService: { handleWorkflowSubEntities: jest.fn() },
      } as never,
      {
        workspaceId: WORKSPACE_ID,
        rolePermissionConfig: {
          unionOf: ['22222222-2222-4222-8222-222222222222'],
        },
      },
    );

    await expect(contextlessTool.execute(baseInput)).resolves.toMatchObject({
      success: false,
      error: 'Workflow tool authority context is missing.',
    });
    expect(workflowRepository.softDelete).not.toHaveBeenCalled();
  });

  it('should return a failure result when deletion throws', async () => {
    const { tool, workflowRepository } = buildTool();

    workflowRepository.softDelete.mockRejectedValue(new Error('boom'));

    const result = (await tool.execute(baseInput)) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.error).toBe('boom');
    expect(result.message).toContain('boom');
  });
});
