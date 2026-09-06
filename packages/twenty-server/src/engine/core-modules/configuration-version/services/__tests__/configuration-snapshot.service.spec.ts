import { ConfigurationSnapshotService } from 'src/engine/core-modules/configuration-version/services/configuration-snapshot.service';
import { buildDeterministicDigest } from 'src/engine/core-modules/policy/utils/build-deterministic-digest.util';
import {
  ALL_METADATA_NAME,
  type AllMetadataName,
} from 'twenty-shared/metadata';
import { getMetadataFlatEntityMapsKey } from 'src/engine/metadata-modules/flat-entity/utils/get-metadata-flat-entity-maps-key.util';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';

describe('ConfigurationSnapshotService', () => {
  const cacheService = {
    getOrRecomputeManyOrAllFlatEntityMaps: jest.fn(),
  };
  const service = new ConfigurationSnapshotService(cacheService as never);

  beforeEach(() => jest.resetAllMocks());

  const buildFlatMaps = () =>
    Object.fromEntries(
      Object.keys(ALL_METADATA_NAME).map((metadataName) => [
        getMetadataFlatEntityMapsKey(metadataName as AllMetadataName),
        { byUniversalIdentifier: {} },
      ]),
    );

  it('builds a stable universal-id contract containing digests instead of values', async () => {
    const entity = {
      universalIdentifier: 'field-universal-id',
      name: 'secretCustomerField',
      defaultValue: 'sentinel-secret-value',
    };

    cacheService.getOrRecomputeManyOrAllFlatEntityMaps.mockResolvedValue({
      ...buildFlatMaps(),
      flatFieldMetadataMaps: {
        byUniversalIdentifier: { 'field-universal-id': entity },
      },
    });

    await expect(service.build(WORKSPACE_ID)).resolves.toEqual({
      schemaVersion: 1,
      entries: {
        'fieldMetadata:field-universal-id': {
          metadataName: 'fieldMetadata',
          universalIdentifier: 'field-universal-id',
          contentDigest: buildDeterministicDigest(entity),
        },
      },
    });

    const snapshot = await service.build(WORKSPACE_ID);
    expect(JSON.stringify(snapshot)).not.toContain('sentinel-secret-value');
  });

  it('rejects a map entry whose key and universal identifier disagree', async () => {
    cacheService.getOrRecomputeManyOrAllFlatEntityMaps.mockResolvedValue({
      ...buildFlatMaps(),
      flatFieldMetadataMaps: {
        byUniversalIdentifier: {
          'field-universal-id': { universalIdentifier: 'foreign-id' },
        },
      },
    });

    await expect(service.build(WORKSPACE_ID)).rejects.toThrow(
      'Configuration metadata universal identifier is mismatched.',
    );
  });
});
