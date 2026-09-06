import { WorkflowCoreSyncService } from 'src/engine/core-modules/workflow/services/workflow-core-sync.service';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const WORKFLOW_ID = '22222222-2222-4222-8222-222222222222';

describe('WorkflowCoreSyncService', () => {
  it('writes the internal core-workflow link with a bounded transactional query', async () => {
    const transactionScope = {
      executeRawQuery: jest.fn().mockResolvedValue([]),
    };
    const workspaceRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: WORKSPACE_ID,
        workspaceCustomApplicationId: 'application-id',
      }),
    };
    const workspaceOrmManager = {
      executeInWorkspaceContext: jest.fn((fn: () => unknown) => fn()),
      getRepository: jest.fn().mockReturnValue({ update: jest.fn() }),
      runInWorkspaceTransaction: jest.fn(
        (fn: (scope: typeof transactionScope) => unknown) =>
          fn(transactionScope),
      ),
    };
    const service = new WorkflowCoreSyncService(
      { upsert: jest.fn() } as never,
      workspaceRepository as never,
      workspaceOrmManager as never,
      {
        getOrRecompute: jest.fn().mockResolvedValue({
          flatFieldMetadataMaps: {
            byUniversalIdentifier: new Proxy({}, { get: () => ({}) }),
          },
        }),
      } as never,
    );

    await service.upsertToCore(WORKSPACE_ID, [
      {
        id: WORKFLOW_ID,
        name: 'Workflow',
        coreWorkflowId: null,
        lastPublishedVersionId: null,
      } as never,
    ]);

    expect(transactionScope.executeRawQuery).toHaveBeenCalledWith(
      expect.stringMatching(/UPDATE .*\."workflow"/),
      expect.any(Array),
    );
  });
});
