import { WorkflowApprovalContinuationListener } from 'src/modules/workflow/workflow-runner/listeners/workflow-approval-continuation.listener';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const REQUEST_ID = '22222222-2222-4222-8222-222222222222';
const APPROVAL_ID = '33333333-3333-4333-8333-333333333333';
const WORKFLOW_RUN_ID = '44444444-4444-4444-8444-444444444444';
const ROOT_CORRELATION_ID = '55555555-5555-4555-8555-555555555555';
const ORIGIN_POLICY_DECISION_ID = '66666666-6666-4666-8666-666666666666';

describe('WorkflowApprovalContinuationListener', () => {
  const approvalRequestService = {
    findApprovedContinuation: jest.fn(),
  };
  const workflowServiceAuthority = { resolve: jest.fn() };
  const workflowRunner = { retryWorkflowStepWithApproval: jest.fn() };
  const listener = new WorkflowApprovalContinuationListener(
    approvalRequestService as never,
    workflowServiceAuthority as never,
    workflowRunner as never,
  );

  beforeEach(() => jest.resetAllMocks());

  it('reconstructs service authority and retries the exact approved step', async () => {
    const authContext = { type: 'application' };
    const rolePermissionConfig = { unionOf: ['role-1'] };

    approvalRequestService.findApprovedContinuation.mockResolvedValue({
      id: REQUEST_ID,
      approvalId: APPROVAL_ID,
      workflowRunId: WORKFLOW_RUN_ID,
      workflowStepId: 'step-1',
      rootCorrelationId: ROOT_CORRELATION_ID,
      originPolicyDecisionId: ORIGIN_POLICY_DECISION_ID,
    });
    workflowServiceAuthority.resolve.mockResolvedValue({
      authContext,
      rolePermissionConfig,
    });

    await listener.handle({
      eventId: '77777777-7777-4777-8777-777777777777',
      workspaceId: WORKSPACE_ID,
      eventType: 'agent.action.approved',
      schemaVersion: 1,
      aggregateType: 'agentActionApprovalRequest',
      aggregateId: REQUEST_ID,
      payload: { requestId: REQUEST_ID, approvalId: APPROVAL_ID },
      payloadDigest: 'a'.repeat(64),
      rootCorrelationId: REQUEST_ID,
    });

    expect(workflowServiceAuthority.resolve).toHaveBeenCalledWith(WORKSPACE_ID);
    expect(workflowRunner.retryWorkflowStepWithApproval).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      workflowRunId: WORKFLOW_RUN_ID,
      workflowStepId: 'step-1',
      approvalId: APPROVAL_ID,
      rootCorrelationId: ROOT_CORRELATION_ID,
      originPolicyDecisionId: ORIGIN_POLICY_DECISION_ID,
      authContext,
      rolePermissionConfig,
    });
  });

  it('does not schedule a workflow for a generic approved tool request', async () => {
    approvalRequestService.findApprovedContinuation.mockResolvedValue({
      id: REQUEST_ID,
      approvalId: APPROVAL_ID,
      workflowRunId: null,
      workflowStepId: null,
      rootCorrelationId: null,
      originPolicyDecisionId: null,
    });

    await listener.handle({
      eventId: '77777777-7777-4777-8777-777777777777',
      workspaceId: WORKSPACE_ID,
      eventType: 'agent.action.approved',
      schemaVersion: 1,
      aggregateType: 'agentActionApprovalRequest',
      aggregateId: REQUEST_ID,
      payload: { requestId: REQUEST_ID, approvalId: APPROVAL_ID },
      payloadDigest: 'a'.repeat(64),
      rootCorrelationId: REQUEST_ID,
    });

    expect(workflowServiceAuthority.resolve).not.toHaveBeenCalled();
    expect(workflowRunner.retryWorkflowStepWithApproval).not.toHaveBeenCalled();
  });

  it('rejects a malformed or foreign continuation envelope', async () => {
    await expect(
      listener.handle({
        eventId: '77777777-7777-4777-8777-777777777777',
        workspaceId: WORKSPACE_ID,
        eventType: 'agent.action.approved',
        schemaVersion: 1,
        aggregateType: 'agentActionApprovalRequest',
        aggregateId: REQUEST_ID,
        payload: {
          requestId: '99999999-9999-4999-8999-999999999999',
          approvalId: APPROVAL_ID,
        },
        payloadDigest: 'a'.repeat(64),
        rootCorrelationId: REQUEST_ID,
      }),
    ).rejects.toThrow('invalid');
    expect(
      approvalRequestService.findApprovedContinuation,
    ).not.toHaveBeenCalled();
  });
});
