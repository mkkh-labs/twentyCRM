import {
  ALL_METADATA_NAME,
  type AllMetadataName,
} from 'twenty-shared/metadata';
import { isPlainObject } from 'twenty-shared/utils';

import { type MetadataChangeOperation } from 'src/engine/core-modules/metadata-change-set/entities/metadata-change-set.entity';
import { buildDeterministicDigest } from 'src/engine/core-modules/policy/utils/build-deterministic-digest.util';
import { type AllFlatEntityOperationRecordByMetadataName } from 'src/engine/metadata-modules/flat-entity/types/all-flat-entity-operation-record-by-metadata-name.type';

const OPERATION_BUCKETS = [
  ['flatEntityToCreate', 'CREATE'],
  ['flatEntityToUpdate', 'UPDATE'],
  ['flatEntityToDelete', 'DELETE'],
] as const;

export const buildMetadataChangeOperations = (
  migrationPlan: AllFlatEntityOperationRecordByMetadataName,
): MetadataChangeOperation[] => {
  const operations: MetadataChangeOperation[] = [];

  for (const metadataName of Object.keys(migrationPlan).sort()) {
    if (!(metadataName in ALL_METADATA_NAME)) {
      throw new Error(
        'Metadata migration plan contains an unknown metadata name.',
      );
    }

    const metadataType = metadataName as AllMetadataName;
    const operationRecord = migrationPlan[metadataType];

    if (!isPlainObject(operationRecord)) {
      throw new Error(
        'Metadata migration plan contains a malformed operation record.',
      );
    }

    for (const [bucketName, operation] of OPERATION_BUCKETS) {
      const operationBucket = operationRecord[bucketName];

      if (!isPlainObject(operationBucket)) {
        throw new Error(
          'Metadata migration plan contains a malformed operation bucket.',
        );
      }

      for (const [universalIdentifier, entity] of Object.entries(
        operationBucket,
      ).sort(([left], [right]) => left.localeCompare(right))) {
        if (
          !isPlainObject(entity) ||
          entity.universalIdentifier !== universalIdentifier
        ) {
          throw new Error(
            'Metadata migration entity universal identifier does not match its plan key.',
          );
        }

        operations.push({
          operation,
          metadataType,
          universalIdentifier,
          payloadDigest: buildDeterministicDigest(entity),
        });
      }
    }
  }

  if (operations.length === 0) {
    throw new Error(
      'Metadata migration plan must contain at least one operation.',
    );
  }

  return operations;
};
