import { ConfigurationVersionService } from 'src/engine/core-modules/configuration-version/services/configuration-version.service';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const VERSION_ID = '22222222-2222-4222-8222-222222222222';
const ROOT_CORRELATION_ID = '33333333-3333-4333-8333-333333333333';

describe('ConfigurationVersionService', () => {
  const insertAndReturnOne = jest.fn();
  const findOne = jest.fn();
  const find = jest.fn();
  const repository = { find, findOne, insertAndReturnOne };
  const managerInsertAndReturnOne = jest.fn();
  const manager = {
    getRepository: jest.fn(() => ({ save: managerInsertAndReturnOne })),
  };
  const transactionalOutboxService = {
    execute: jest.fn(async ({ mutate }) => mutate(manager)),
  };
  const service = new ConfigurationVersionService(
    repository as never,
    transactionalOutboxService as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('creates a configuration version and its event in one transaction', async () => {
    managerInsertAndReturnOne.mockImplementation(async (entity) => entity);

    await service.createWithOutbox({
      id: VERSION_ID,
      workspaceId: WORKSPACE_ID,
      metadataVersion: 9,
      platformVersion: '2.38.0',
      changeSetId: '44444444-4444-4444-8444-444444444444',
      snapshot: {
        schemaVersion: 1,
        entries: {
          'objectMetadata:object-id': {
            metadataName: 'objectMetadata',
            universalIdentifier: 'object-id',
            contentDigest: 'a'.repeat(64),
          },
        },
      },
      rootCorrelationId: ROOT_CORRELATION_ID,
    });

    expect(transactionalOutboxService.execute).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      event: expect.objectContaining({
        eventType: 'configuration.version.created',
        schemaVersion: 1,
        aggregateType: 'configurationVersion',
        aggregateId: VERSION_ID,
        rootCorrelationId: ROOT_CORRELATION_ID,
        payload: expect.objectContaining({
          configurationVersionId: VERSION_ID,
          metadataVersion: 9,
        }),
      }),
      mutate: expect.any(Function),
    });
    expect(manager.getRepository).toHaveBeenCalled();
    expect(managerInsertAndReturnOne).toHaveBeenCalledWith(
      expect.objectContaining({
        id: VERSION_ID,
        workspaceId: WORKSPACE_ID,
        metadataVersion: 9,
      }),
    );
    expect(insertAndReturnOne).not.toHaveBeenCalled();
  });

  it('compares only workspace-bound persisted contract versions', async () => {
    findOne
      .mockResolvedValueOnce({
        id: 'from-id',
        snapshot: {
          schemaVersion: 1,
          entries: {
            'fieldMetadata:field-id': {
              metadataName: 'fieldMetadata',
              universalIdentifier: 'field-id',
              contentDigest: 'a'.repeat(64),
            },
          },
        },
      })
      .mockResolvedValueOnce({
        id: 'to-id',
        snapshot: { schemaVersion: 1, entries: {} },
      });

    await expect(
      service.compare({
        workspaceId: WORKSPACE_ID,
        fromVersionId: 'from-id',
        toVersionId: 'to-id',
      }),
    ).resolves.toMatchObject({ compatibility: 'BREAKING' });

    expect(findOne).toHaveBeenNthCalledWith(1, WORKSPACE_ID, {
      where: { id: 'from-id' },
    });
    expect(findOne).toHaveBeenNthCalledWith(2, WORKSPACE_ID, {
      where: { id: 'to-id' },
    });
  });

  it('fails closed when either contract version is missing', async () => {
    findOne.mockResolvedValue(null);

    await expect(
      service.compare({
        workspaceId: WORKSPACE_ID,
        fromVersionId: 'missing',
        toVersionId: 'to-id',
      }),
    ).rejects.toThrow('Configuration version was not found.');
  });

  it('lists workspace contract versions without exposing snapshots', async () => {
    find.mockResolvedValue([{ id: VERSION_ID }]);

    await expect(
      service.list({ workspaceId: WORKSPACE_ID, limit: 20 }),
    ).resolves.toHaveLength(1);
    expect(find).toHaveBeenCalledWith(WORKSPACE_ID, {
      order: { createdAt: 'DESC' },
      take: 20,
    });
  });
});
