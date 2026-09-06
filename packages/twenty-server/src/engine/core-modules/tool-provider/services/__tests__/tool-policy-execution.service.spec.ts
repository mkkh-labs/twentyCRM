import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { ToolCategory } from 'twenty-shared/ai';
import { AgentActionPolicyService } from 'src/engine/core-modules/policy/services/agent-action-policy.service';
import { PolicyContextService } from 'src/engine/core-modules/policy/services/policy-context.service';
import { PolicyCorrelationService } from 'src/engine/core-modules/policy/services/policy-correlation.service';
import { PolicyDecisionService } from 'src/engine/core-modules/policy/services/policy-decision.service';
import { ProtectedOperationService } from 'src/engine/core-modules/policy/services/protected-operation.service';
import { buildAgentActionDigest } from 'src/engine/core-modules/policy/utils/build-agent-action-digest.util';
import { ToolPolicyExecutionService } from 'src/engine/core-modules/tool-provider/services/tool-policy-execution.service';

describe('ToolPolicyExecutionService', () => {
  const workspaceId = '20202020-0000-4000-8000-000000000001';
  const roleId = '20202020-0000-4000-8000-000000000002';
  const userId = '20202020-0000-4000-8000-000000000003';
  const workspaceMemberId = '20202020-0000-4000-8000-000000000004';
  const authContext = {
    type: 'user',
    workspace: { id: workspaceId },
    user: { id: userId },
    userWorkspaceId: '20202020-0000-4000-8000-000000000005',
    workspaceMemberId,
    workspaceMember: { id: workspaceMemberId },
  } as unknown as WorkspaceAuthContext;

  const buildHarness = ({
    globalWritesEnabled = false,
    workspaceWritesEnabled = false,
  } = {}) => {
    const featureFlagService = {
      isFeatureEnabled: jest.fn().mockResolvedValue(workspaceWritesEnabled),
    };
    const twentyConfigService = {
      get: jest.fn().mockReturnValue(globalWritesEnabled),
    };
    const agentActionApprovalService = {
      findById: jest.fn(),
      findActiveByBinding: jest.fn().mockResolvedValue(undefined),
      consume: jest.fn(),
    };
    const agentActionApprovalRequestService = {
      request: jest.fn().mockResolvedValue({}),
    };
    const auditService = { append: jest.fn().mockResolvedValue({}) };
    const telemetryService = {
      recordAuditUnavailable: jest.fn(),
      recordDecision: jest.fn(),
      recordReconciliationRequired: jest.fn(),
    };
    const service = new ToolPolicyExecutionService(
      featureFlagService as never,
      twentyConfigService as never,
      agentActionApprovalService as never,
      agentActionApprovalRequestService as never,
      new AgentActionPolicyService(),
      new PolicyContextService(),
      new PolicyCorrelationService(),
      new PolicyDecisionService(),
      new ProtectedOperationService(
        auditService as never,
        telemetryService as never,
      ),
    );

    return {
      service,
      auditService,
      agentActionApprovalService,
      agentActionApprovalRequestService,
    };
  };

  const buildContext = () => ({
    workspaceId,
    roleId,
    rolePermissionConfig: { unionOf: [roleId] },
    authContext,
    automationAllowed: true,
  });

  it('allows authenticated reads while write switches are off', async () => {
    const { service, auditService } = buildHarness();
    const effect = jest.fn().mockResolvedValue({
      success: true,
      message: 'read',
    });

    const result = await service.execute({
      descriptor: {
        name: 'find_companies',
        label: 'Find companies',
        description: 'Find companies',
        category: ToolCategory.DATABASE_CRUD,
        executionRef: {
          kind: 'database_crud',
          operation: 'find_many',
          objectNameSingular: 'company',
        },
      },
      arguments: {},
      context: buildContext(),
      roleAllowed: true,
      effect,
    });

    expect(result).toEqual({ success: true, message: 'read' });
    expect(effect).toHaveBeenCalledTimes(1);
    expect(auditService.append).toHaveBeenCalledTimes(2);
  });

  it('denies writes before side effects when either kill switch is off', async () => {
    const { service } = buildHarness({
      globalWritesEnabled: true,
      workspaceWritesEnabled: false,
    });
    const effect = jest.fn();

    const result = await service.execute({
      descriptor: {
        name: 'create_company',
        label: 'Create company',
        description: 'Create company',
        category: ToolCategory.DATABASE_CRUD,
        executionRef: {
          kind: 'database_crud',
          operation: 'create_one',
          objectNameSingular: 'company',
        },
      },
      arguments: { name: 'Acme' },
      context: buildContext(),
      roleAllowed: true,
      effect,
    });

    expect(result).toMatchObject({ success: false });
    expect(result.error).toContain('KILL_SWITCH_ACTIVE');
    expect(effect).not.toHaveBeenCalled();
  });

  it('rejects cross-workspace auth before policy or effect execution', async () => {
    const { service } = buildHarness();
    const effect = jest.fn();

    await expect(
      service.execute({
        descriptor: {
          name: 'find_companies',
          label: 'Find companies',
          description: 'Find companies',
          category: ToolCategory.DATABASE_CRUD,
          executionRef: {
            kind: 'database_crud',
            operation: 'find_many',
            objectNameSingular: 'company',
          },
        },
        arguments: {},
        context: {
          ...buildContext(),
          workspaceId: '20202020-0000-4000-8000-000000000099',
        },
        roleAllowed: true,
        effect,
      }),
    ).rejects.toThrow('another workspace');
    expect(effect).not.toHaveBeenCalled();
  });

  it('denies before side effects when the current role no longer exposes the tool', async () => {
    const { service } = buildHarness();
    const effect = jest.fn();

    const result = await service.execute({
      descriptor: {
        name: 'find_companies',
        label: 'Find companies',
        description: 'Find companies',
        category: ToolCategory.DATABASE_CRUD,
        executionRef: {
          kind: 'database_crud',
          operation: 'find_many',
          objectNameSingular: 'company',
        },
      },
      arguments: {},
      context: buildContext(),
      roleAllowed: false,
      effect,
    });

    expect(result).toMatchObject({ success: false });
    expect(result.error).toContain('ROLE_DENIED');
    expect(effect).not.toHaveBeenCalled();
  });

  it('creates one digest-bound request when a material action needs approval', async () => {
    const { service, agentActionApprovalRequestService } = buildHarness({
      globalWritesEnabled: true,
      workspaceWritesEnabled: true,
    });
    const effect = jest.fn();

    const result = await service.execute({
      descriptor: {
        name: 'delete_company',
        label: 'Delete company',
        description: 'Delete company',
        category: ToolCategory.DATABASE_CRUD,
        executionRef: {
          kind: 'database_crud',
          operation: 'delete_one',
          objectNameSingular: 'company',
        },
      },
      arguments: { id: 'record-1' },
      context: {
        ...buildContext(),
        rootCorrelationId: '20202020-0000-4000-8000-000000000008',
        workflowRunId: '20202020-0000-4000-8000-000000000009',
        workflowStepId: 'workflow-step-1',
      },
      roleAllowed: true,
      effect,
    });

    expect(result.error).toContain('APPROVAL_REQUIRED');
    expect(agentActionApprovalRequestService.request).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: userId,
        riskClass: 'R3',
        workspaceId,
        actionDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        rootCorrelationId: '20202020-0000-4000-8000-000000000008',
        workflowRunId: '20202020-0000-4000-8000-000000000009',
        workflowStepId: 'workflow-step-1',
        originPolicyDecisionId: expect.any(String),
      }),
    );
    expect(effect).not.toHaveBeenCalled();
  });

  it('discovers a live server-side approval for the exact workflow effect binding', async () => {
    const { service, agentActionApprovalService } = buildHarness({
      globalWritesEnabled: true,
      workspaceWritesEnabled: true,
    });
    const approvalId = '20202020-0000-4000-8000-000000000006';
    const workflowRunId = '20202020-0000-4000-8000-000000000009';
    const workflowStepId = 'workflow-step-1';
    const actionArguments = { id: 'record-1' };
    const actionDigest = buildAgentActionDigest({
      workspaceId,
      actorId: userId,
      action: 'database.delete_one',
      target: 'database:company',
      arguments: actionArguments,
      workflowRunId,
      workflowStepId,
    });
    const approval = {
      id: approvalId,
      workspaceId,
      actorId: userId,
      actionDigest,
      approverId: '20202020-0000-4000-8000-000000000007',
      expiresAt: '2099-01-01T00:00:00.000Z',
      consumedAt: null,
    };
    const effect = jest.fn().mockResolvedValue({
      success: true,
      message: 'deleted',
    });

    agentActionApprovalService.findActiveByBinding.mockResolvedValue(approval);

    await expect(
      service.execute({
        descriptor: {
          name: 'delete_company',
          label: 'Delete company',
          description: 'Delete company',
          category: ToolCategory.DATABASE_CRUD,
          executionRef: {
            kind: 'database_crud',
            operation: 'delete_one',
            objectNameSingular: 'company',
          },
        },
        arguments: actionArguments,
        context: {
          ...buildContext(),
          workflowRunId,
          workflowStepId,
        },
        roleAllowed: true,
        effect,
      }),
    ).resolves.toMatchObject({ success: true });
    expect(agentActionApprovalService.findActiveByBinding).toHaveBeenCalledWith(
      { workspaceId, actorId: userId, actionDigest },
    );
    expect(agentActionApprovalService.consume).toHaveBeenCalledWith(
      expect.objectContaining({ id: approvalId, actionDigest }),
    );
    expect(effect).toHaveBeenCalledTimes(1);
  });

  it('binds an approved material effect to its approval audit identity', async () => {
    const { service, auditService, agentActionApprovalService } = buildHarness({
      globalWritesEnabled: true,
      workspaceWritesEnabled: true,
    });
    const approvalId = '20202020-0000-4000-8000-000000000006';
    const actionArguments = { id: 'record-1' };
    const actionDigest = buildAgentActionDigest({
      workspaceId,
      actorId: userId,
      action: 'database.delete_one',
      target: 'database:company',
      arguments: actionArguments,
    });
    const effect = jest.fn().mockResolvedValue({
      success: true,
      message: 'deleted',
    });

    agentActionApprovalService.findById.mockResolvedValue({
      id: approvalId,
      workspaceId,
      actorId: userId,
      actionDigest,
      approverId: '20202020-0000-4000-8000-000000000007',
      expiresAt: '2099-01-01T00:00:00.000Z',
      consumedAt: null,
    });

    await service.execute({
      descriptor: {
        name: 'delete_company',
        label: 'Delete company',
        description: 'Delete company',
        category: ToolCategory.DATABASE_CRUD,
        executionRef: {
          kind: 'database_crud',
          operation: 'delete_one',
          objectNameSingular: 'company',
        },
      },
      arguments: actionArguments,
      context: { ...buildContext(), approvalId },
      roleAllowed: true,
      effect,
    });

    expect(agentActionApprovalService.consume).toHaveBeenCalledWith(
      expect.objectContaining({ id: approvalId, actionDigest }),
    );
    expect(auditService.append).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ approvalId }),
      }),
    );
    expect(effect).toHaveBeenCalledTimes(1);
  });
});
