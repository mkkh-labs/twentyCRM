import { WorkflowActionType } from 'twenty-shared/workflow';

import { CodeWorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/code/code.workflow-action';
import { LogicFunctionWorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/logic-function/logic-function.workflow-action';
import { AiAgentWorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/ai-agent/ai-agent.workflow-action';
import { type WorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/types/workflow-action.type';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const WORKFLOW_RUN_ID = '22222222-2222-4222-8222-222222222222';
const LOGIC_FUNCTION_ID = '33333333-3333-4333-8333-333333333333';

const executionContext = {
  authContext: {
    type: 'application',
    workspace: { id: WORKSPACE_ID },
    application: { id: '44444444-4444-4444-8444-444444444444' },
  },
  initiator: { source: 'WORKFLOW', name: 'Workflow' },
  isActingOnBehalfOfUser: false,
  roleId: '55555555-5555-4555-8555-555555555555',
  rolePermissionConfig: {
    unionOf: ['55555555-5555-4555-8555-555555555555'],
  },
};

const runInfo = {
  workspaceId: WORKSPACE_ID,
  workflowRunId: WORKFLOW_RUN_ID,
  rootCorrelationId: '66666666-6666-4666-8666-666666666666',
};

const buildStep = ({
  type,
  input,
}: {
  type: WorkflowActionType;
  input: Record<string, unknown>;
}): WorkflowAction =>
  ({
    id: 'step-1',
    name: 'Protected action',
    type,
    valid: true,
    settings: {
      input,
      outputSchema: {},
      errorHandlingOptions: {
        retryOnFailure: { value: false },
        continueOnFailure: { value: false },
      },
    },
  }) as WorkflowAction;

describe('protected workflow actions', () => {
  const policyDenial = {
    success: false,
    message: 'Approval is required',
    error: 'APPROVAL_REQUIRED',
  };

  it('does not execute workflow code after policy denial', async () => {
    const executeLogicFunction = jest.fn();
    const executeEffect = jest.fn().mockResolvedValue(policyDenial);
    const action = new CodeWorkflowAction(
      { execute: executeLogicFunction } as never,
      {
        getExecutionContext: jest.fn().mockResolvedValue(executionContext),
      } as never,
      { setStepLog: jest.fn() } as never,
      { hasToolPermission: jest.fn().mockResolvedValue(true) } as never,
      { execute: executeEffect } as never,
    );

    const result = await action.execute({
      currentStepId: 'step-1',
      steps: [
        buildStep({
          type: WorkflowActionType.CODE,
          input: {
            logicFunctionId: LOGIC_FUNCTION_ID,
            logicFunctionInput: { contactId: 'contact-1' },
          },
        }),
      ],
      context: {},
      runInfo,
    });

    expect(result).toEqual({ error: 'APPROVAL_REQUIRED' });
    expect(executeEffect).toHaveBeenCalledWith(
      expect.objectContaining({ roleAllowed: true }),
    );
    expect(executeLogicFunction).not.toHaveBeenCalled();
  });

  it('does not invoke an exposed logic function after policy denial', async () => {
    const executeLogicFunction = jest.fn();
    const executeEffect = jest.fn().mockResolvedValue(policyDenial);
    const action = new LogicFunctionWorkflowAction(
      { execute: executeLogicFunction } as never,
      {
        getExecutionContext: jest.fn().mockResolvedValue(executionContext),
      } as never,
      {
        getOrRecomputeManyOrAllFlatEntityMaps: jest.fn().mockResolvedValue({
          flatLogicFunctionMaps: {
            universalIdentifierById: {
              [LOGIC_FUNCTION_ID]: 'logic-function-universal-id',
            },
            byUniversalIdentifier: {
              'logic-function-universal-id': {
                id: LOGIC_FUNCTION_ID,
                name: 'Approved logic function',
                workflowActionTriggerSettings: {},
              },
            },
          },
        }),
      } as never,
      { hasToolPermission: jest.fn().mockResolvedValue(true) } as never,
      { execute: executeEffect } as never,
    );

    const result = await action.execute({
      currentStepId: 'step-1',
      steps: [
        buildStep({
          type: WorkflowActionType.LOGIC_FUNCTION,
          input: {
            logicFunctionId: LOGIC_FUNCTION_ID,
            logicFunctionInput: { contactId: 'contact-1' },
          },
        }),
      ],
      context: {},
      runInfo,
    });

    expect(result).toEqual({ error: 'APPROVAL_REQUIRED' });
    expect(executeEffect).toHaveBeenCalledWith(
      expect.objectContaining({ roleAllowed: true }),
    );
    expect(executeLogicFunction).not.toHaveBeenCalled();
  });

  it('does not send sensitive AI input to a provider after policy denial', async () => {
    const executeAgent = jest.fn();
    const executeEffect = jest.fn().mockResolvedValue(policyDenial);
    const action = new AiAgentWorkflowAction(
      { executeAgent } as never,
      {
        getExecutionContext: jest.fn().mockResolvedValue(executionContext),
      } as never,
      { setStepLog: jest.fn() } as never,
      { findOne: jest.fn() } as never,
      { checkRolesPermissions: jest.fn().mockResolvedValue(true) } as never,
      { execute: executeEffect } as never,
    );

    const result = await action.execute({
      currentStepId: 'step-1',
      steps: [
        buildStep({
          type: WorkflowActionType.AI_AGENT,
          input: { prompt: 'sentinel-secret-value' },
        }),
      ],
      context: {},
      runInfo,
    });

    expect(result).toEqual({ error: 'APPROVAL_REQUIRED' });
    expect(executeEffect).toHaveBeenCalledWith(
      expect.objectContaining({
        actionInput: {
          agentId: null,
          promptDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
        roleAllowed: true,
      }),
    );
    expect(JSON.stringify(executeEffect.mock.calls)).not.toContain(
      'sentinel-secret-value',
    );
    expect(executeAgent).not.toHaveBeenCalled();
  });
});
