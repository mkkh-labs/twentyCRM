import { isDefined } from 'twenty-shared/utils';

import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';

export const getWorkflowRecordFieldMetadataIds = ({
  objectMetadataId,
  fieldNames,
  flatFieldMetadataMaps,
}: Readonly<{
  objectMetadataId: string;
  fieldNames: readonly string[];
  flatFieldMetadataMaps: FlatEntityMaps<FlatFieldMetadata>;
}>): string[] => {
  const fieldNameSet = new Set(fieldNames);

  return Object.values(flatFieldMetadataMaps.byUniversalIdentifier)
    .filter(isDefined)
    .filter(
      (fieldMetadata) =>
        fieldMetadata.objectMetadataId === objectMetadataId &&
        fieldNameSet.has(fieldMetadata.name),
    )
    .map((fieldMetadata) => fieldMetadata.id)
    .sort();
};
