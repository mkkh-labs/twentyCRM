import { diffConfigurationSnapshots } from 'src/engine/core-modules/configuration-version/utils/diff-configuration-snapshots.util';

describe('diffConfigurationSnapshots', () => {
  it('uses stable universal identifiers and classifies removals as breaking', () => {
    expect(
      diffConfigurationSnapshots(
        {
          schemaVersion: 1,
          entries: {
            'fieldMetadata:field-1': {
              metadataName: 'fieldMetadata',
              universalIdentifier: 'field-1',
              contentDigest: 'a'.repeat(64),
            },
            'fieldMetadata:field-2': {
              metadataName: 'fieldMetadata',
              universalIdentifier: 'field-2',
              contentDigest: 'b'.repeat(64),
            },
          },
        },
        {
          schemaVersion: 1,
          entries: {
            'fieldMetadata:field-1': {
              metadataName: 'fieldMetadata',
              universalIdentifier: 'field-1',
              contentDigest: 'c'.repeat(64),
            },
            'fieldMetadata:field-3': {
              metadataName: 'fieldMetadata',
              universalIdentifier: 'field-3',
              contentDigest: 'd'.repeat(64),
            },
          },
        },
      ),
    ).toEqual({
      added: ['fieldMetadata:field-3'],
      changed: ['fieldMetadata:field-1'],
      removed: ['fieldMetadata:field-2'],
      compatibility: 'BREAKING',
    });
  });

  it('classifies additive-only snapshots as backward compatible', () => {
    expect(
      diffConfigurationSnapshots(
        { schemaVersion: 1, entries: {} },
        {
          schemaVersion: 1,
          entries: {
            'fieldMetadata:field-1': {
              metadataName: 'fieldMetadata',
              universalIdentifier: 'field-1',
              contentDigest: 'a'.repeat(64),
            },
          },
        },
      ),
    ).toMatchObject({ compatibility: 'BACKWARD_COMPATIBLE' });
  });

  it('requires review when an existing contract entry changes', () => {
    expect(
      diffConfigurationSnapshots(
        {
          schemaVersion: 1,
          entries: {
            'fieldMetadata:field-1': {
              metadataName: 'fieldMetadata',
              universalIdentifier: 'field-1',
              contentDigest: 'a'.repeat(64),
            },
          },
        },
        {
          schemaVersion: 1,
          entries: {
            'fieldMetadata:field-1': {
              metadataName: 'fieldMetadata',
              universalIdentifier: 'field-1',
              contentDigest: 'b'.repeat(64),
            },
          },
        },
      ),
    ).toMatchObject({ compatibility: 'REVIEW_REQUIRED' });
  });

  it('rejects snapshots with unsupported schema versions', () => {
    expect(() =>
      diffConfigurationSnapshots({ schemaVersion: 2, entries: {} } as never, {
        schemaVersion: 1,
        entries: {},
      }),
    ).toThrow('Configuration snapshot schema version is unsupported.');
  });
});
