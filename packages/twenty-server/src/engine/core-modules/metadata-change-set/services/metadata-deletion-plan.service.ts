import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { type AllFlatEntityOperationRecordByMetadataName } from 'src/engine/metadata-modules/flat-entity/types/all-flat-entity-operation-record-by-metadata-name.type';
import { type AllFlatEntityOperationByMetadataName } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-to-create-delete-update.type';
import { WorkspaceManyOrAllFlatEntityMapsCacheService } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.service';
import { findFlatEntityByIdInFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/utils/find-flat-entity-by-id-in-flat-entity-maps.util';
import { transpileFlatEntityOperationArrayToRecord } from 'src/engine/metadata-modules/flat-entity/utils/transpile-flat-entity-operation-array-to-record.util';
import { fromDeleteFieldInputToFlatFieldMetadatasToDelete } from 'src/engine/metadata-modules/flat-field-metadata/utils/from-delete-field-input-to-flat-field-metadatas-to-delete.util';
import { fromDeleteObjectInputToFlatFieldMetadatasToDelete } from 'src/engine/metadata-modules/flat-object-metadata/utils/from-delete-object-input-to-flat-field-metadatas-to-delete.util';
import { WidgetConfigurationType } from 'src/engine/metadata-modules/page-layout-widget/enums/widget-configuration-type.type';

export type MetadataDeletionTargetType = 'OBJECT' | 'FIELD' | 'INDEX';

export type MetadataDeletionPlan = Readonly<{
  applicationUniversalIdentifier: string;
  migrationPlan: AllFlatEntityOperationRecordByMetadataName;
  rollbackPlan: AllFlatEntityOperationRecordByMetadataName;
}>;

@Injectable()
export class MetadataDeletionPlanService {
  constructor(
    private readonly applicationService: ApplicationService,
    private readonly flatEntityMapsCacheService: WorkspaceManyOrAllFlatEntityMapsCacheService,
  ) {}

  async build({
    workspaceId,
    targetType,
    targetId,
  }: Readonly<{
    workspaceId: string;
    targetType: MetadataDeletionTargetType;
    targetId: string;
  }>): Promise<MetadataDeletionPlan> {
    const { workspaceCustomFlatApplication } =
      await this.applicationService.findWorkspaceTwentyStandardAndCustomApplicationOrThrow(
        { workspaceId },
      );
    const operations = await this.buildOperations({
      workspaceId,
      targetType,
      targetId,
    });

    return {
      applicationUniversalIdentifier:
        workspaceCustomFlatApplication.universalIdentifier,
      migrationPlan: transpileFlatEntityOperationArrayToRecord(
        operations.migration,
      ),
      rollbackPlan: transpileFlatEntityOperationArrayToRecord(
        operations.rollback,
      ),
    };
  }

  private async buildOperations({
    workspaceId,
    targetType,
    targetId,
  }: Readonly<{
    workspaceId: string;
    targetType: MetadataDeletionTargetType;
    targetId: string;
  }>): Promise<{
    migration: AllFlatEntityOperationByMetadataName;
    rollback: AllFlatEntityOperationByMetadataName;
  }> {
    if (targetType === 'INDEX') {
      return this.buildIndexOperations({ workspaceId, targetId });
    }
    if (targetType === 'FIELD') {
      return this.buildFieldOperations({ workspaceId, targetId });
    }

    return this.buildObjectOperations({ workspaceId, targetId });
  }

  private async buildIndexOperations({
    workspaceId,
    targetId,
  }: Readonly<{ workspaceId: string; targetId: string }>) {
    const { flatIndexMaps } =
      await this.flatEntityMapsCacheService.getOrRecomputeManyOrAllFlatEntityMaps(
        { workspaceId, flatMapsKeys: ['flatIndexMaps'] },
      );
    const index = findFlatEntityByIdInFlatEntityMaps({
      flatEntityMaps: flatIndexMaps,
      flatEntityId: targetId,
    });

    if (!isDefined(index)) {
      throw new Error('Index to delete was not found.');
    }
    if (!index.isCustom) {
      throw new Error('System indexes cannot be deleted.');
    }

    return {
      migration: {
        index: {
          flatEntityToCreate: [],
          flatEntityToUpdate: [],
          flatEntityToDelete: [index],
        },
      },
      rollback: {
        index: {
          flatEntityToCreate: [index],
          flatEntityToUpdate: [],
          flatEntityToDelete: [],
        },
      },
    } satisfies {
      migration: AllFlatEntityOperationByMetadataName;
      rollback: AllFlatEntityOperationByMetadataName;
    };
  }

  private async buildObjectOperations({
    workspaceId,
    targetId,
  }: Readonly<{ workspaceId: string; targetId: string }>) {
    const { flatObjectMetadataMaps, flatFieldMetadataMaps, flatIndexMaps } =
      await this.flatEntityMapsCacheService.getOrRecomputeManyOrAllFlatEntityMaps(
        {
          workspaceId,
          flatMapsKeys: [
            'flatObjectMetadataMaps',
            'flatFieldMetadataMaps',
            'flatIndexMaps',
          ],
        },
      );
    const {
      flatObjectMetadataToDelete,
      flatFieldMetadatasToDelete,
      flatIndexToDelete,
    } = fromDeleteObjectInputToFlatFieldMetadatasToDelete({
      deleteObjectInput: { id: targetId },
      flatObjectMetadataMaps,
      flatFieldMetadataMaps,
      flatIndexMaps,
    });
    const objectOperations = {
      objectMetadata: {
        flatEntityToCreate: [],
        flatEntityToUpdate: [],
        flatEntityToDelete: [flatObjectMetadataToDelete],
      },
      fieldMetadata: {
        flatEntityToCreate: [],
        flatEntityToUpdate: [],
        flatEntityToDelete: flatFieldMetadatasToDelete,
      },
      index: {
        flatEntityToCreate: [],
        flatEntityToUpdate: [],
        flatEntityToDelete: flatIndexToDelete,
      },
    } satisfies AllFlatEntityOperationByMetadataName;

    return {
      migration: objectOperations,
      rollback: {
        objectMetadata: {
          flatEntityToCreate: [flatObjectMetadataToDelete],
          flatEntityToUpdate: [],
          flatEntityToDelete: [],
        },
        fieldMetadata: {
          flatEntityToCreate: flatFieldMetadatasToDelete,
          flatEntityToUpdate: [],
          flatEntityToDelete: [],
        },
        index: {
          flatEntityToCreate: flatIndexToDelete,
          flatEntityToUpdate: [],
          flatEntityToDelete: [],
        },
      },
    } satisfies {
      migration: AllFlatEntityOperationByMetadataName;
      rollback: AllFlatEntityOperationByMetadataName;
    };
  }

  private async buildFieldOperations({
    workspaceId,
    targetId,
  }: Readonly<{ workspaceId: string; targetId: string }>) {
    const {
      flatObjectMetadataMaps,
      flatFieldMetadataMaps,
      flatIndexMaps,
      flatPageLayoutWidgetMaps,
    } =
      await this.flatEntityMapsCacheService.getOrRecomputeManyOrAllFlatEntityMaps(
        {
          workspaceId,
          flatMapsKeys: [
            'flatObjectMetadataMaps',
            'flatFieldMetadataMaps',
            'flatIndexMaps',
            'flatPageLayoutWidgetMaps',
          ],
        },
      );
    const {
      flatFieldMetadatasToDelete,
      flatIndexesToDelete,
      flatIndexesToUpdate,
    } = fromDeleteFieldInputToFlatFieldMetadatasToDelete({
      deleteOneFieldInput: { id: targetId },
      flatObjectMetadataMaps,
      flatFieldMetadataMaps,
      flatIndexMaps,
    });
    const deletedFieldIds = new Set(
      flatFieldMetadatasToDelete
        .map(
          ({ universalIdentifier }) =>
            flatFieldMetadataMaps.byUniversalIdentifier[universalIdentifier]
              ?.id,
        )
        .filter(isDefined),
    );
    const pageLayoutWidgetsToDelete = Object.values(
      flatPageLayoutWidgetMaps.byUniversalIdentifier,
    )
      .filter(isDefined)
      .filter(
        (widget) =>
          !isDefined(widget.deletedAt) &&
          widget.configuration?.configurationType ===
            WidgetConfigurationType.FIELD &&
          deletedFieldIds.has(widget.configuration.fieldMetadataId),
      );
    const originalIndexesToRestore = flatIndexesToUpdate.map((index) => {
      const original =
        flatIndexMaps.byUniversalIdentifier[index.universalIdentifier];

      if (!isDefined(original)) {
        throw new Error('Original index is unavailable for metadata rollback.');
      }

      return original;
    });

    return {
      migration: {
        fieldMetadata: {
          flatEntityToCreate: [],
          flatEntityToUpdate: [],
          flatEntityToDelete: flatFieldMetadatasToDelete,
        },
        index: {
          flatEntityToCreate: [],
          flatEntityToUpdate: flatIndexesToUpdate,
          flatEntityToDelete: flatIndexesToDelete,
        },
        pageLayoutWidget: {
          flatEntityToCreate: [],
          flatEntityToUpdate: [],
          flatEntityToDelete: pageLayoutWidgetsToDelete,
        },
      },
      rollback: {
        fieldMetadata: {
          flatEntityToCreate: flatFieldMetadatasToDelete,
          flatEntityToUpdate: [],
          flatEntityToDelete: [],
        },
        index: {
          flatEntityToCreate: flatIndexesToDelete,
          flatEntityToUpdate: originalIndexesToRestore,
          flatEntityToDelete: [],
        },
        pageLayoutWidget: {
          flatEntityToCreate: pageLayoutWidgetsToDelete,
          flatEntityToUpdate: [],
          flatEntityToDelete: [],
        },
      },
    } satisfies {
      migration: AllFlatEntityOperationByMetadataName;
      rollback: AllFlatEntityOperationByMetadataName;
    };
  }
}
