import { buildWorkspaceImportVerificationSql } from 'src/database/commands/workspace-export/utils/build-workspace-import-verification-sql.util';

const WORKSPACE_ID = '20202020-b374-4779-a561-80086cb2a73d';
const CONFIGURATION_VERSION_ID = '30303030-b374-4779-a561-80086cb2a73d';
const SNAPSHOT_DIGEST = 'a'.repeat(64);

describe('buildWorkspaceImportVerificationSql', () => {
  it('verifies the workspace and configuration version before restore commit', () => {
    const sql = buildWorkspaceImportVerificationSql({
      workspaceId: WORKSPACE_ID,
      configurationVersion: {
        id: CONFIGURATION_VERSION_ID,
        snapshotDigest: SNAPSHOT_DIGEST,
      },
    });

    expect(sql).toContain(`FROM core.workspace WHERE id = '${WORKSPACE_ID}'`);
    expect(sql).toContain('FROM core."configurationVersion"');
    expect(sql).toContain(`id = '${CONFIGURATION_VERSION_ID}'`);
    expect(sql).toContain(`"workspaceId" = '${WORKSPACE_ID}'`);
    expect(sql).toContain(`"snapshotDigest" = '${SNAPSHOT_DIGEST}'`);
    expect(sql).toContain('RAISE EXCEPTION');
  });

  it('omits the configuration version check when the export has none', () => {
    const sql = buildWorkspaceImportVerificationSql({
      workspaceId: WORKSPACE_ID,
      configurationVersion: null,
    });

    expect(sql).toContain(`FROM core.workspace WHERE id = '${WORKSPACE_ID}'`);
    expect(sql).not.toContain('configurationVersion');
  });

  it('rejects values that cannot be safely embedded in trusted SQL', () => {
    expect(() =>
      buildWorkspaceImportVerificationSql({
        workspaceId: `${WORKSPACE_ID}'; DROP TABLE core.workspace; --`,
        configurationVersion: null,
      }),
    ).toThrow('Invalid workspace import verification binding');
  });
});
