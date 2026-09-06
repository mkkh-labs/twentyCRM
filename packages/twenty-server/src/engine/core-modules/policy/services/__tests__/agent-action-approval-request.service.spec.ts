import { AgentActionApprovalRequestService } from 'src/engine/core-modules/policy/services/agent-action-approval-request.service';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';
const ACTION_DIGEST = 'a'.repeat(64);
const NOW = new Date('2026-09-01T12:00:00.000Z');

describe('AgentActionApprovalRequestService', () => {
  const repository = {
    insertAndReturnOne: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
  };
  const dataSource = { transaction: jest.fn() };
  const transactionalOutboxService = { execute: jest.fn() };
  const service = new AgentActionApprovalRequestService(
    dataSource as never,
    repository as never,
    transactionalOutboxService as never,
  );

  beforeEach(() => jest.resetAllMocks());

  it('creates a bounded digest-only request for a material action', async () => {
    repository.insertAndReturnOne.mockImplementation(
      async (_workspaceId, input) => input,
    );

    await expect(
      service.request({
        workspaceId: WORKSPACE_ID,
        actorId: ACTOR_ID,
        action: 'database.delete_one',
        target: 'database:company',
        riskClass: 'R3',
        actionDigest: ACTION_DIGEST,
        workflowRunId: '55555555-5555-4555-8555-555555555555',
        workflowStepId: 'step-1',
        rootCorrelationId: '66666666-6666-4666-8666-666666666666',
        originPolicyDecisionId: '77777777-7777-4777-8777-777777777777',
        now: NOW,
      }),
    ).resolves.toMatchObject({
      actorId: ACTOR_ID,
      actionDigest: ACTION_DIGEST,
      status: 'PENDING',
      expiresAt: new Date('2026-09-01T12:15:00.000Z'),
      workflowRunId: '55555555-5555-4555-8555-555555555555',
      workflowStepId: 'step-1',
      rootCorrelationId: '66666666-6666-4666-8666-666666666666',
      originPolicyDecisionId: '77777777-7777-4777-8777-777777777777',
    });
    expect(repository.insertAndReturnOne).toHaveBeenCalledWith(
      WORKSPACE_ID,
      expect.not.objectContaining({ arguments: expect.anything() }),
    );
  });

  it('reuses the same live pending request after a uniqueness race', async () => {
    const existing = {
      id: '33333333-3333-4333-8333-333333333333',
      expiresAt: new Date('2026-09-01T12:10:00.000Z'),
    };

    repository.insertAndReturnOne.mockRejectedValue({ code: '23505' });
    repository.findOne.mockResolvedValue(existing);

    await expect(
      service.request({
        workspaceId: WORKSPACE_ID,
        actorId: ACTOR_ID,
        action: 'database.delete_one',
        target: 'database:company',
        riskClass: 'R3',
        actionDigest: ACTION_DIGEST,
        now: NOW,
      }),
    ).resolves.toBe(existing);
  });

  it('rejects approval when the request cannot be locked as live and pending', async () => {
    const requestRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    const manager = {
      getRepository: jest.fn().mockReturnValue(requestRepository),
    };

    transactionalOutboxService.execute.mockImplementation(async ({ mutate }) =>
      mutate(manager),
    );

    await expect(
      service.approve({
        workspaceId: WORKSPACE_ID,
        requestId: '33333333-3333-4333-8333-333333333333',
        approverId: '44444444-4444-4444-8444-444444444444',
        expiresAt: new Date('2026-09-01T12:10:00.000Z'),
        now: NOW,
      }),
    ).rejects.toThrow('missing, expired, or resolved');
  });

  it('approves and records a durable continuation event in one transaction', async () => {
    const request = {
      id: '33333333-3333-4333-8333-333333333333',
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      action: 'database.delete_one',
      target: 'database:company',
      riskClass: 'R3',
      actionDigest: ACTION_DIGEST,
      workflowRunId: '55555555-5555-4555-8555-555555555555',
      workflowStepId: 'step-1',
      rootCorrelationId: '66666666-6666-4666-8666-666666666666',
      originPolicyDecisionId: '77777777-7777-4777-8777-777777777777',
      status: 'PENDING',
    };
    const requestRepository = {
      findOne: jest.fn().mockResolvedValue(request),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const approvalRepository = {
      create: jest.fn().mockImplementation((input) => input),
      save: jest.fn().mockImplementation(async (input) => input),
    };
    const manager = {
      getRepository: jest
        .fn()
        .mockReturnValueOnce(requestRepository)
        .mockReturnValueOnce(approvalRepository)
        .mockReturnValueOnce(requestRepository),
    };
    let emittedEvent: Record<string, unknown> | undefined;

    transactionalOutboxService.execute.mockImplementation(
      async ({ event, mutate }) => {
        const result = await mutate(manager);

        emittedEvent = typeof event === 'function' ? event(result) : event;

        return result;
      },
    );

    const approval = await service.approve({
      workspaceId: WORKSPACE_ID,
      requestId: request.id,
      approverId: '44444444-4444-4444-8444-444444444444',
      expiresAt: new Date('2026-09-01T12:10:00.000Z'),
      now: NOW,
    });

    expect(emittedEvent).toMatchObject({
      eventType: 'agent.action.approved',
      aggregateType: 'agentActionApprovalRequest',
      aggregateId: request.id,
      rootCorrelationId: request.rootCorrelationId,
      payload: {
        requestId: request.id,
        approvalId: approval.id,
      },
    });
  });

  it('denies a live request with a workspace-bound locked update', async () => {
    const request = {
      id: '33333333-3333-4333-8333-333333333333',
      workspaceId: WORKSPACE_ID,
      status: 'PENDING',
    };
    const requestRepository = {
      findOne: jest.fn().mockResolvedValue(request),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      create: jest.fn().mockImplementation((input) => input),
    };
    const manager = {
      getRepository: jest.fn().mockReturnValue(requestRepository),
    };

    dataSource.transaction.mockImplementation(async (callback) =>
      callback(manager),
    );

    await expect(
      service.deny({
        workspaceId: WORKSPACE_ID,
        requestId: request.id,
        now: NOW,
      }),
    ).resolves.toMatchObject({ status: 'DENIED' });
    expect(requestRepository.update).toHaveBeenCalledWith(
      { id: request.id, workspaceId: WORKSPACE_ID, status: 'PENDING' },
      { status: 'DENIED' },
    );
  });

  it('loads only the approved request bound to the delivered approval', async () => {
    const approved = {
      id: '33333333-3333-4333-8333-333333333333',
      approvalId: '88888888-8888-4888-8888-888888888888',
      status: 'APPROVED',
    };

    repository.findOne.mockResolvedValue(approved);

    await expect(
      service.findApprovedContinuation({
        workspaceId: WORKSPACE_ID,
        requestId: approved.id,
        approvalId: approved.approvalId,
      }),
    ).resolves.toBe(approved);
    expect(repository.findOne).toHaveBeenCalledWith(WORKSPACE_ID, {
      where: {
        id: approved.id,
        approvalId: approved.approvalId,
        status: 'APPROVED',
      },
    });
  });
});
