import { WorkflowEffectService } from 'src/engine/core-modules/workflow-reliability/services/workflow-effect.service';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const EFFECT_ID = '22222222-2222-4222-8222-222222222222';
const EFFECT_KEY = 'a'.repeat(64);
const ACTION_DIGEST = 'b'.repeat(64);

describe('WorkflowEffectService', () => {
  const repository = {
    find: jest.fn(),
    insertAndReturnOne: jest.fn(),
    findOneBy: jest.fn(),
    update: jest.fn(),
  };
  const service = new WorkflowEffectService(repository as never);
  const input = {
    id: EFFECT_ID,
    workspaceId: WORKSPACE_ID,
    effectKey: EFFECT_KEY,
    workflowRunId: '33333333-3333-4333-8333-333333333333',
    stepId: 'send-email',
    actionDigest: ACTION_DIGEST,
    providerClass: 'email',
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('reserves a new effect once', async () => {
    repository.insertAndReturnOne.mockResolvedValue({
      ...input,
      state: 'QUEUED',
    });

    await expect(service.reserve(input)).resolves.toMatchObject({
      status: 'RESERVED',
      execution: { state: 'QUEUED', effectKey: EFFECT_KEY },
    });
  });

  it('returns an exactly matching duplicate without reserving a second effect', async () => {
    repository.insertAndReturnOne.mockRejectedValue({ code: '23505' });
    repository.findOneBy.mockResolvedValue({ ...input, state: 'SUCCEEDED' });

    await expect(service.reserve(input)).resolves.toMatchObject({
      status: 'DUPLICATE',
      execution: { state: 'SUCCEEDED', effectKey: EFFECT_KEY },
    });
  });

  it('rejects an effect-key collision with different action evidence', async () => {
    repository.insertAndReturnOne.mockRejectedValue({ code: '23505' });
    repository.findOneBy.mockResolvedValue({
      ...input,
      actionDigest: 'c'.repeat(64),
      state: 'QUEUED',
    });

    await expect(service.reserve(input)).rejects.toThrow(
      'Workflow effect key is bound to different action evidence.',
    );
  });

  it('uses a compare-and-set transition so concurrent attempts cannot both run', async () => {
    repository.update.mockResolvedValue({ affected: 0 });

    await expect(
      service.transition({
        workspaceId: WORKSPACE_ID,
        id: EFFECT_ID,
        from: 'QUEUED',
        to: 'RUNNING',
      }),
    ).rejects.toThrow('Workflow effect transition lost a concurrent race.');

    expect(repository.update).toHaveBeenCalledWith(
      WORKSPACE_ID,
      { id: EFFECT_ID, state: 'QUEUED' },
      { state: 'RUNNING' },
    );
  });

  it('keeps an ambiguous external outcome running for reconciliation', async () => {
    repository.update.mockResolvedValue({ affected: 1 });

    await service.markOutcomeUncertain({
      workspaceId: WORKSPACE_ID,
      id: EFFECT_ID,
      reason: 'provider timed out after request transmission',
    });

    expect(repository.update).toHaveBeenCalledWith(
      WORKSPACE_ID,
      { id: EFFECT_ID, state: 'RUNNING' },
      expect.objectContaining({
        lastErrorCode: 'EXTERNAL_OUTCOME_UNCERTAIN',
        uncertaintyReason: 'provider timed out after request transmission',
      }),
    );
  });

  it('moves an exhausted retry to the durable dead-letter state', async () => {
    repository.update.mockResolvedValue({ affected: 1 });

    await service.markDeadLettered({
      workspaceId: WORKSPACE_ID,
      id: EFFECT_ID,
      from: 'RUNNING',
      errorCode: 'WORKFLOW_TRIGGER_FAILED',
    });

    expect(repository.update).toHaveBeenCalledWith(
      WORKSPACE_ID,
      { id: EFFECT_ID, state: 'RUNNING' },
      expect.objectContaining({
        state: 'DEAD_LETTERED',
        retryAt: null,
        lastErrorCode: 'WORKFLOW_TRIGGER_FAILED',
        attemptCount: expect.any(Function),
      }),
    );
  });

  it('lists workspace operations in newest-first order', async () => {
    repository.find.mockResolvedValue([{ id: EFFECT_ID }]);

    await expect(
      service.listRecent({ workspaceId: WORKSPACE_ID, limit: 50 }),
    ).resolves.toHaveLength(1);
    expect(repository.find).toHaveBeenCalledWith(WORKSPACE_ID, {
      order: { updatedAt: 'DESC' },
      take: 50,
    });
  });
});
