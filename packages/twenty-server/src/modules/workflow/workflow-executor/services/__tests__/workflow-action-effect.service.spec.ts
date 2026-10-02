import { ToolCategory } from 'twenty-shared/ai';

import { WorkflowActionEffectService } from 'src/modules/workflow/workflow-executor/services/workflow-action-effect.service';

describe('WorkflowActionEffectService', () => {
  it('binds current authority, approval, and transport correlation before execution', async () => {
    const workflowToolEffectService = {
      execute: jest.fn().mockResolvedValue({
        success: true,
        message: 'executed',
      }),
    };
    const service = new WorkflowActionEffectService(
      workflowToolEffectService as never,
    );
    const execute = jest.fn();

    await service.execute({
      actionInput: { payloadDigest: 'a'.repeat(64) },
      category: ToolCategory.LOGIC_FUNCTION,
      description: 'Execute function',
      executionContext: {
        roleId: '11111111-1111-4111-8111-111111111111',
        rolePermissionConfig: {
          unionOf: ['11111111-1111-4111-8111-111111111111'],
        },
        authContext: {
          type: 'application',
          workspace: { id: '22222222-2222-4222-8222-222222222222' },
          application: { id: '33333333-3333-4333-8333-333333333333' },
        } as never,
        initiator: { source: 'WORKFLOW', name: 'Workflow' } as never,
        isActingOnBehalfOfUser: false,
      },
      executionRef: {
        kind: 'logic_function',
        logicFunctionId: '44444444-4444-4444-8444-444444444444',
      },
      name: 'workflow_function',
      providerClass: 'workflow-function',
      roleAllowed: true,
      runInfo: {
        workspaceId: '22222222-2222-4222-8222-222222222222',
        workflowRunId: '55555555-5555-4555-8555-555555555555',
        jobId: 'job-1',
        rootCorrelationId: '66666666-6666-4666-8666-666666666666',
        approvalId: '77777777-7777-4777-8777-777777777777',
      },
      stepId: 'step-1',
      execute,
    });

    expect(workflowToolEffectService.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        roleAllowed: true,
        policyContext: expect.objectContaining({
          approvalId: '77777777-7777-4777-8777-777777777777',
          jobId: 'job-1',
          rootCorrelationId: '66666666-6666-4666-8666-666666666666',
          workflowRunId: '55555555-5555-4555-8555-555555555555',
        }),
      }),
    );
  });
});
