import { type WorkspacePortableExportManifest } from 'src/database/commands/workspace-export/types/workspace-portable-export-manifest.type';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA_256_PATTERN = /^[0-9a-f]{64}$/i;

type WorkspaceImportVerificationBinding = Pick<
  WorkspacePortableExportManifest,
  'workspaceId' | 'configurationVersion'
>;

export const buildWorkspaceImportVerificationSql = ({
  workspaceId,
  configurationVersion,
}: WorkspaceImportVerificationBinding): string => {
  if (
    !UUID_PATTERN.test(workspaceId) ||
    (configurationVersion !== null &&
      (!UUID_PATTERN.test(configurationVersion.id) ||
        !SHA_256_PATTERN.test(configurationVersion.snapshotDigest)))
  ) {
    throw new Error('Invalid workspace import verification binding.');
  }

  const configurationVersionCheck =
    configurationVersion === null
      ? ''
      : `
  IF NOT EXISTS (
    SELECT 1
    FROM core."configurationVersion"
    WHERE id = '${configurationVersion.id}'::uuid
      AND "workspaceId" = '${workspaceId}'::uuid
      AND "snapshotDigest" = '${configurationVersion.snapshotDigest}'
  ) THEN
    RAISE EXCEPTION 'Restored configuration version verification failed.';
  END IF;
`;

  return `
DO $twenty_workspace_import_verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM core.workspace WHERE id = '${workspaceId}'::uuid
  ) THEN
    RAISE EXCEPTION 'Restored workspace verification failed.';
  END IF;
${configurationVersionCheck}END
$twenty_workspace_import_verify$;
`;
};
