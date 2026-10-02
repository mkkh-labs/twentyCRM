import { MetadataDependencyAnalyzerService } from 'src/engine/core-modules/metadata-change-set/services/metadata-dependency-analyzer.service';

describe('MetadataDependencyAnalyzerService', () => {
  const objectRepository = { find: jest.fn() };
  const fieldRepository = { find: jest.fn() };
  const viewRepository = { find: jest.fn() };
  const viewFieldRepository = { find: jest.fn() };
  const viewFilterRepository = { find: jest.fn() };
  const viewSortRepository = { find: jest.fn() };
  const workflowVersionRepository = { find: jest.fn() };
  const applicationRepository = { find: jest.fn() };
  const service = new MetadataDependencyAnalyzerService(
    objectRepository as never,
    fieldRepository as never,
    viewRepository as never,
    viewFieldRepository as never,
    viewFilterRepository as never,
    viewSortRepository as never,
    workflowVersionRepository as never,
    applicationRepository as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    objectRepository.find.mockResolvedValue([]);
    fieldRepository.find.mockResolvedValue([]);
    viewRepository.find.mockResolvedValue([]);
    viewFieldRepository.find.mockResolvedValue([]);
    viewFilterRepository.find.mockResolvedValue([]);
    viewSortRepository.find.mockResolvedValue([]);
    workflowVersionRepository.find.mockResolvedValue([]);
    applicationRepository.find.mockResolvedValue([]);
  });

  it('finds workflow, view, application, contract, and metadata dependencies', async () => {
    objectRepository.find.mockResolvedValue([
      { id: 'object-id', applicationId: 'application-id' },
    ]);
    fieldRepository.find
      .mockResolvedValueOnce([
        { id: 'field-id', applicationId: 'application-id' },
      ])
      .mockResolvedValueOnce([{ universalIdentifier: 'related-field' }]);
    viewRepository.find.mockResolvedValue([{ id: 'view-object' }]);
    viewFieldRepository.find.mockResolvedValue([{ viewId: 'view-field' }]);
    workflowVersionRepository.find.mockResolvedValue([
      {
        id: 'workflow-1',
        triggers: [{ objectMetadataId: 'object-id' }],
        steps: [],
      },
      { id: 'workflow-2', triggers: [], steps: [] },
    ]);

    await expect(
      service.analyze({
        workspaceId: '11111111-1111-4111-8111-111111111111',
        operations: [
          {
            operation: 'DELETE',
            metadataType: 'fieldMetadata',
            universalIdentifier: '22222222-2222-4222-8222-222222222222',
            payloadDigest: 'a'.repeat(64),
          },
        ],
      }),
    ).resolves.toEqual({
      workflows: ['workflow-1'],
      views: ['view-field', 'view-object'],
      applications: ['application-id'],
      contracts: ['fieldMetadata:22222222-2222-4222-8222-222222222222'],
      metadata: ['related-field'],
    });
  });
});
