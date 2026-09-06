import { OutboxOperationsService } from 'src/engine/core-modules/transactional-outbox/services/outbox-operations.service';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';

describe('OutboxOperationsService', () => {
  const repository = { find: jest.fn() };
  const service = new OutboxOperationsService(repository as never);

  beforeEach(() => jest.resetAllMocks());

  it('lists only workspace-scoped operational evidence without payloads', async () => {
    repository.find.mockResolvedValue([
      { id: 'event-1', payload: { secret: true } },
    ]);

    await expect(
      service.listRecent({ workspaceId: WORKSPACE_ID, limit: 50 }),
    ).resolves.toEqual([{ id: 'event-1', payload: { secret: true } }]);
    expect(repository.find).toHaveBeenCalledWith(WORKSPACE_ID, {
      order: { createdAt: 'DESC' },
      take: 50,
    });
  });

  it.each([0, 101, 1.5])(
    'rejects an invalid list limit of %p',
    async (limit) => {
      await expect(
        service.listRecent({ workspaceId: WORKSPACE_ID, limit }),
      ).rejects.toThrow('Outbox operation list limit is invalid.');
      expect(repository.find).not.toHaveBeenCalled();
    },
  );
});
