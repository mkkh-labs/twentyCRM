import { WorkflowEffectService } from 'src/engine/core-modules/workflow-reliability/services/workflow-effect.service';
import { WorkflowToolEffectService } from 'src/engine/core-modules/workflow-reliability/services/workflow-tool-effect.service';
import { WorkflowProviderCapabilityRegistryService } from 'src/engine/core-modules/workflow-reliability/services/workflow-provider-capability-registry.service';
import { ToolCategory } from 'twenty-shared/ai';

const WORKSPACE_ID = '20202020-1111-4111-8111-111111111111';
const WORKFLOW_RUN_ID = '20202020-2222-4222-8222-222222222222';

describe('WorkflowToolEffectService', () => {
  const workflowEffectService = {
    reserve: jest.fn(),
    transition: jest.fn(),
    markSucceeded: jest.fn(),
    markOutcomeUncertain: jest.fn(),
  };
  const toolPolicyExecutionService = {
    execute: jest.fn(),
  };
  const service = new WorkflowToolEffectService(
    workflowEffectService as unknown as WorkflowEffectService,
    toolPolicyExecutionService as never,
    new WorkflowProviderCapabilityRegistryService(),
  );
  const input = {
    workspaceId: WORKSPACE_ID,
    workflowRunId: WORKFLOW_RUN_ID,
    stepId: 'send-email-step',
    providerClass: 'SendEmailWorkflowAction',
    actionInput: { subject: 'Hello' },
    descriptor: {
      name: 'send_email',
      label: 'Send email',
      description: 'Send email',
      category: ToolCategory.ACTION,
      executionRef: { kind: 'static' as const, toolId: 'send_email' },
    },
    policyContext: {
      workspaceId: WORKSPACE_ID,
      roleId: '20202020-3333-4333-8333-333333333333',
      rolePermissionConfig: {
        unionOf: ['20202020-3333-4333-8333-333333333333'],
      },
      authContext: {
        type: 'application' as const,
        workspace: { id: WORKSPACE_ID },
        application: { id: '20202020-4444-4444-8444-444444444444' },
      } as never,
      automationAllowed: true,
      rootCorrelationId: WORKFLOW_RUN_ID,
    },
    roleAllowed: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    workflowEffectService.reserve.mockResolvedValue({
      status: 'RESERVED',
      execution: { id: 'effect-1', state: 'QUEUED' },
    });
    toolPolicyExecutionService.execute.mockImplementation(async ({ effect }) =>
      effect(),
    );
  });

  it('rejects an unregistered provider before policy or effect execution', async () => {
    const execute = jest.fn();

    await expect(
      service.execute({
        ...input,
        providerClass: 'unregistered-provider',
        execute,
      }),
    ).rejects.toThrow('requires one explicit capability contract');

    expect(toolPolicyExecutionService.execute).not.toHaveBeenCalled();
    expect(workflowEffectService.reserve).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('does not reserve or call a provider when policy denies', async () => {
    toolPolicyExecutionService.execute.mockResolvedValue({
      success: false,
      message: 'Tool execution denied by policy',
      error: 'ROLE_DENIED',
    });
    const execute = jest.fn();

    await expect(service.execute({ ...input, execute })).resolves.toMatchObject(
      {
        success: false,
        error: 'ROLE_DENIED',
      },
    );

    expect(workflowEffectService.reserve).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(toolPolicyExecutionService.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        descriptor: input.descriptor,
        context: expect.objectContaining({
          ...input.policyContext,
          workflowRunId: WORKFLOW_RUN_ID,
          mutationOrEffectId: expect.any(String),
        }),
        roleAllowed: true,
      }),
    );
  });

  it('reserves and completes one successful protected effect', async () => {
    const execute = jest.fn().mockResolvedValue({
      success: true,
      message: 'sent',
      result: { providerId: 'provider-1' },
    });

    await expect(service.execute({ ...input, execute })).resolves.toMatchObject(
      {
        success: true,
      },
    );

    expect(workflowEffectService.transition).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      id: 'effect-1',
      from: 'QUEUED',
      to: 'RUNNING',
    });
    expect(workflowEffectService.markSucceeded).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        id: 'effect-1',
        providerReference: { providerId: 'provider-1' },
      }),
    );
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('does not repeat an already succeeded effect', async () => {
    workflowEffectService.reserve.mockResolvedValue({
      status: 'DUPLICATE',
      execution: { id: 'effect-1', state: 'SUCCEEDED' },
    });
    const execute = jest.fn();

    await expect(service.execute({ ...input, execute })).resolves.toMatchObject(
      {
        success: true,
        result: { deduplicated: true },
      },
    );

    expect(execute).not.toHaveBeenCalled();
  });

  it('requires reconciliation instead of repeating an uncertain effect', async () => {
    workflowEffectService.reserve.mockResolvedValue({
      status: 'DUPLICATE',
      execution: { id: 'effect-1', state: 'RUNNING' },
    });
    const execute = jest.fn();

    await expect(service.execute({ ...input, execute })).resolves.toMatchObject(
      {
        success: false,
        error: expect.stringContaining('reconciliation'),
      },
    );

    expect(execute).not.toHaveBeenCalled();
  });

  it('marks a failed provider result uncertain and does not schedule a retry', async () => {
    const execute = jest.fn().mockResolvedValue({
      success: false,
      message: 'provider failed',
      error: 'timeout',
    });

    await service.execute({ ...input, execute });

    expect(workflowEffectService.markOutcomeUncertain).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      id: 'effect-1',
      reason: 'PROVIDER_RESULT_UNCERTAIN',
    });
  });

  it('marks a thrown provider outcome uncertain and preserves the error', async () => {
    const providerError = new Error('connection reset');
    const execute = jest.fn().mockRejectedValue(providerError);

    await expect(service.execute({ ...input, execute })).rejects.toBe(
      providerError,
    );

    expect(workflowEffectService.markOutcomeUncertain).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      id: 'effect-1',
      reason: 'PROVIDER_THROW_UNCERTAIN',
    });
  });
});
