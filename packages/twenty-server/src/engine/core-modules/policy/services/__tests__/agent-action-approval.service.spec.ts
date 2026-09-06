import { AgentActionApprovalService } from 'src/engine/core-modules/policy/services/agent-action-approval.service';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const APPROVAL_ID = '22222222-2222-4222-8222-222222222222';
const ACTOR_ID = '33333333-3333-4333-8333-333333333333';

describe('AgentActionApprovalService', () => {
  const repository = {
    insertAndReturnOne: jest.fn(),
    update: jest.fn(),
    findOne: jest.fn(),
  };
  const service = new AgentActionApprovalService(repository as never);

  beforeEach(() => jest.resetAllMocks());

  it('issues a short-lived approval bound to the action and arguments', async () => {
    repository.insertAndReturnOne.mockImplementation(
      async (_workspaceId, input) => input,
    );

    const approval = await service.issueForTool({
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      approverId: '44444444-4444-4444-8444-444444444444',
      executionRef: {
        kind: 'database_crud',
        objectNameSingular: 'company',
        operation: 'delete_one',
      },
      arguments: { id: 'record-1' },
      expiresAt: new Date(Date.now() + 60_000),
    });

    expect(approval).toMatchObject({
      action: 'database.delete_one',
      target: 'database:company',
      riskClass: 'R3',
      actionDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it('does not issue approvals for low-risk actions', async () => {
    await expect(
      service.issueForTool({
        workspaceId: WORKSPACE_ID,
        actorId: ACTOR_ID,
        approverId: '44444444-4444-4444-8444-444444444444',
        executionRef: {
          kind: 'database_crud',
          objectNameSingular: 'company',
          operation: 'update_one',
        },
        arguments: {},
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ).rejects.toThrow('must bind a material tool action');
    expect(repository.insertAndReturnOne).not.toHaveBeenCalled();
  });

  it('consumes an exact approval once with a compare-and-set update', async () => {
    repository.update.mockResolvedValue({ affected: 1 });

    await expect(
      service.consume({
        id: APPROVAL_ID,
        workspaceId: WORKSPACE_ID,
        actorId: '33333333-3333-4333-8333-333333333333',
        actionDigest: 'a'.repeat(64),
        consumedAt: new Date('2026-09-01T00:00:00.000Z'),
      }),
    ).resolves.toBeUndefined();

    expect(repository.update).toHaveBeenCalledTimes(1);
  });

  it('does not resolve an approval from another workspace', async () => {
    repository.findOne.mockResolvedValue(null);

    await expect(
      service.findById({
        id: APPROVAL_ID,
        workspaceId: WORKSPACE_ID,
      }),
    ).resolves.toBeUndefined();
    expect(repository.findOne).toHaveBeenCalledWith(
      WORKSPACE_ID,
      expect.objectContaining({ where: { id: APPROVAL_ID } }),
    );
  });

  it('rejects replay or a binding mismatch when nothing is consumed', async () => {
    repository.update.mockResolvedValue({ affected: 0 });

    await expect(
      service.consume({
        id: APPROVAL_ID,
        workspaceId: WORKSPACE_ID,
        actorId: '33333333-3333-4333-8333-333333333333',
        actionDigest: 'a'.repeat(64),
        consumedAt: new Date('2026-09-01T00:00:00.000Z'),
      }),
    ).rejects.toThrow(
      'Approval is expired, reused, or bound to another action.',
    );
  });
});
