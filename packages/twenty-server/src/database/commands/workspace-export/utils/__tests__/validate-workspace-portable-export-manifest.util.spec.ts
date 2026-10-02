import { type WorkspacePortableExportManifest } from 'src/database/commands/workspace-export/types/workspace-portable-export-manifest.type';
import { validateWorkspacePortableExportManifest } from 'src/database/commands/workspace-export/utils/validate-workspace-portable-export-manifest.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

const manifest: WorkspacePortableExportManifest = {
  schemaVersion: 1,
  exportId: '10101010-b374-4779-a561-80086cb2a73d',
  rootCorrelationId: '11111111-b374-4779-a561-80086cb2a73d',
  platformVersion: '2.38.0',
  workspaceId: '20202020-b374-4779-a561-80086cb2a73d',
  workspaceSchemaName: getWorkspaceSchemaName(
    '20202020-b374-4779-a561-80086cb2a73d',
  ),
  createdAt: '2026-09-01T12:00:00.000Z',
  configurationVersion: {
    id: '30303030-b374-4779-a561-80086cb2a73d',
    snapshotDigest: 'a'.repeat(64),
  },
  scope: { type: 'FULL', tables: [] },
  artifact: {
    fileName: 'workspace.sql.enc',
    cipher: 'AES-256-GCM',
    keyDerivation: 'SCRYPT',
    salt: 'a'.repeat(32),
    initializationVector: 'b'.repeat(24),
    authenticationTag: 'c'.repeat(32),
    sha256: 'd'.repeat(64),
    containsSensitiveData: true,
  },
};

describe('validateWorkspacePortableExportManifest', () => {
  it('accepts a complete full-workspace manifest at the supported version', () => {
    expect(validateWorkspacePortableExportManifest(manifest, '2.38.0')).toEqual(
      manifest,
    );
  });

  it.each([
    ['schemaVersion', { ...manifest, schemaVersion: 2 }],
    ['platformVersion', { ...manifest, platformVersion: '2.37.0' }],
    ['workspaceId', { ...manifest, workspaceId: 'not-a-uuid' }],
    [
      'workspaceSchemaName',
      { ...manifest, workspaceSchemaName: 'workspace_foreign' },
    ],
    [
      'artifact fileName',
      {
        ...manifest,
        artifact: { ...manifest.artifact, fileName: '../workspace.sql.enc' },
      },
    ],
    [
      'filtered scope',
      { ...manifest, scope: { type: 'FILTERED', tables: ['person'] } },
    ],
  ])('rejects an invalid %s contract', (_caseName, candidate) => {
    expect(() =>
      validateWorkspacePortableExportManifest(candidate, '2.38.0'),
    ).toThrow();
  });
});
