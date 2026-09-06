import { TransactionalOutboxService } from 'src/engine/core-modules/transactional-outbox/services/transactional-outbox.service';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';

describe('TransactionalOutboxService', () => {
  const insert = jest.fn();
  const manager = {
    getRepository: jest.fn(() => ({ insert })),
  };
  const dataSource = {
    transaction: jest.fn(async (callback) => callback(manager)),
  };
  const service = new TransactionalOutboxService(dataSource as never);

  beforeEach(() => jest.clearAllMocks());

  it('writes the mutation and versioned outbox event with one transaction manager', async () => {
    const mutate = jest.fn(async (transactionManager) => {
      expect(transactionManager).toBe(manager);
      return { id: 'record-1' };
    });

    await expect(
      service.execute({
        workspaceId: WORKSPACE_ID,
        event: {
          id: '22222222-2222-4222-8222-222222222222',
          eventType: 'record.updated',
          schemaVersion: 1,
          aggregateType: 'person',
          aggregateId: '33333333-3333-4333-8333-333333333333',
          payload: { changedFieldIds: ['city'] },
          rootCorrelationId: '44444444-4444-4444-8444-444444444444',
        },
        mutate,
      }),
    ).resolves.toEqual({ id: 'record-1' });

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        eventType: 'record.updated',
        schemaVersion: 1,
        state: 'PENDING',
      }),
    );
  });

  it('does not swallow a mutation failure', async () => {
    await expect(
      service.execute({
        workspaceId: WORKSPACE_ID,
        event: {
          id: '22222222-2222-4222-8222-222222222222',
          eventType: 'record.updated',
          schemaVersion: 1,
          aggregateType: 'person',
          aggregateId: '33333333-3333-4333-8333-333333333333',
          payload: {},
          rootCorrelationId: '44444444-4444-4444-8444-444444444444',
        },
        mutate: async () => {
          throw new Error('mutation failed');
        },
      }),
    ).rejects.toThrow('mutation failed');

    expect(insert).not.toHaveBeenCalled();
  });

  it('writes an outbox event through an existing workspace transaction', async () => {
    const executeRawQuery = jest.fn().mockResolvedValue([]);

    await service.insertWithinWorkspaceTransaction({
      workspaceId: WORKSPACE_ID,
      event: {
        id: '22222222-2222-4222-8222-222222222222',
        eventType: 'workflow.run.created',
        schemaVersion: 1,
        aggregateType: 'workflowRun',
        aggregateId: '33333333-3333-4333-8333-333333333333',
        payload: {
          workflowRunId: '33333333-3333-4333-8333-333333333333',
        },
        rootCorrelationId: '33333333-3333-4333-8333-333333333333',
      },
      transactionScope: { executeRawQuery } as never,
    });

    expect(executeRawQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO core."outboxEvent"'),
      expect.arrayContaining([
        WORKSPACE_ID,
        'workflow.run.created',
        1,
        'workflowRun',
        '33333333-3333-4333-8333-333333333333',
      ]),
    );
  });
});
