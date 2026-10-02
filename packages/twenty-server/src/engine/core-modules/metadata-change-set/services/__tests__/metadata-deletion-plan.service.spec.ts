import { createEmptyAllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-all-flat-entity-maps.constant';
import { MetadataDeletionPlanService } from 'src/engine/core-modules/metadata-change-set/services/metadata-deletion-plan.service';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const INDEX_ID = '22222222-2222-4222-8222-222222222222';
const INDEX_UNIVERSAL_IDENTIFIER = '33333333-3333-4333-8333-333333333333';
const APPLICATION_UNIVERSAL_IDENTIFIER = '44444444-4444-4444-8444-444444444444';

describe('MetadataDeletionPlanService', () => {
  it('builds reversible index deletion without applying metadata', async () => {
    const flatMaps = createEmptyAllFlatEntityMaps();
    const index = {
      id: INDEX_ID,
      universalIdentifier: INDEX_UNIVERSAL_IDENTIFIER,
      isCustom: true,
      isSystemSideEffect: false,
    };

    flatMaps.flatIndexMaps.universalIdentifierById[INDEX_ID] =
      INDEX_UNIVERSAL_IDENTIFIER;
    flatMaps.flatIndexMaps.byUniversalIdentifier[INDEX_UNIVERSAL_IDENTIFIER] =
      index as never;

    const service = new MetadataDeletionPlanService(
      {
        findWorkspaceTwentyStandardAndCustomApplicationOrThrow: jest
          .fn()
          .mockResolvedValue({
            workspaceCustomFlatApplication: {
              universalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
            },
          }),
      } as never,
      {
        getOrRecomputeManyOrAllFlatEntityMaps: jest
          .fn()
          .mockResolvedValue(flatMaps),
      } as never,
    );

    await expect(
      service.build({
        workspaceId: WORKSPACE_ID,
        targetType: 'INDEX',
        targetId: INDEX_ID,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        applicationUniversalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
        migrationPlan: expect.objectContaining({
          index: expect.objectContaining({
            flatEntityToDelete: {
              [INDEX_UNIVERSAL_IDENTIFIER]: index,
            },
          }),
        }),
        rollbackPlan: expect.objectContaining({
          index: expect.objectContaining({
            flatEntityToCreate: {
              [INDEX_UNIVERSAL_IDENTIFIER]: index,
            },
          }),
        }),
      }),
    );
  });

  it('rejects deletion of a system index before creating a change set', async () => {
    const flatMaps = createEmptyAllFlatEntityMaps();
    const index = {
      id: INDEX_ID,
      universalIdentifier: INDEX_UNIVERSAL_IDENTIFIER,
      isCustom: false,
      isSystemSideEffect: false,
    };

    flatMaps.flatIndexMaps.universalIdentifierById[INDEX_ID] =
      INDEX_UNIVERSAL_IDENTIFIER;
    flatMaps.flatIndexMaps.byUniversalIdentifier[INDEX_UNIVERSAL_IDENTIFIER] =
      index as never;

    const service = new MetadataDeletionPlanService(
      {
        findWorkspaceTwentyStandardAndCustomApplicationOrThrow: jest
          .fn()
          .mockResolvedValue({
            workspaceCustomFlatApplication: {
              universalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
            },
          }),
      } as never,
      {
        getOrRecomputeManyOrAllFlatEntityMaps: jest
          .fn()
          .mockResolvedValue(flatMaps),
      } as never,
    );

    await expect(
      service.build({
        workspaceId: WORKSPACE_ID,
        targetType: 'INDEX',
        targetId: INDEX_ID,
      }),
    ).rejects.toThrow('System indexes cannot be deleted');
  });
});
