import { buildDeterministicDigest } from 'src/engine/core-modules/policy/utils/build-deterministic-digest.util';
import { buildMetadataChangeOperations } from 'src/engine/core-modules/metadata-change-set/utils/build-metadata-change-operations.util';

describe('buildMetadataChangeOperations', () => {
  it('derives risk-bearing operations from the executable plan', () => {
    const deletedField = {
      universalIdentifier: 'field-universal-id',
      name: 'secretField',
    };

    expect(
      buildMetadataChangeOperations({
        fieldMetadata: {
          flatEntityToCreate: {},
          flatEntityToUpdate: {},
          flatEntityToDelete: {
            'field-universal-id': deletedField,
          },
        },
      } as never),
    ).toEqual([
      {
        operation: 'DELETE',
        metadataType: 'fieldMetadata',
        universalIdentifier: 'field-universal-id',
        payloadDigest: buildDeterministicDigest(deletedField),
      },
    ]);
  });

  it('rejects a payload whose key and universal identifier disagree', () => {
    expect(() =>
      buildMetadataChangeOperations({
        fieldMetadata: {
          flatEntityToCreate: {},
          flatEntityToUpdate: {},
          flatEntityToDelete: {
            'field-universal-id': {
              universalIdentifier: 'different-field-universal-id',
            },
          },
        },
      } as never),
    ).toThrow('universal identifier');
  });

  it('rejects unknown metadata names and malformed operation buckets', () => {
    expect(() =>
      buildMetadataChangeOperations({
        unknownMetadata: {
          flatEntityToCreate: {},
          flatEntityToUpdate: {},
          flatEntityToDelete: {},
        },
      } as never),
    ).toThrow('metadata name');
    expect(() =>
      buildMetadataChangeOperations({
        fieldMetadata: {
          flatEntityToCreate: null,
          flatEntityToUpdate: {},
          flatEntityToDelete: {},
        },
      } as never),
    ).toThrow('operation bucket');
  });
});
