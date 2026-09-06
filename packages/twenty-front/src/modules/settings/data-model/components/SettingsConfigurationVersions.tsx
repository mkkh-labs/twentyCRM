import { useQuery } from '@apollo/client/react';

import { SettingsOptionCardContentButton } from '@/settings/components/SettingsOptions/SettingsOptionCardContentButton';
import {
  GET_CONFIGURATION_VERSION_DIFF,
  GET_CONFIGURATION_VERSIONS,
  type ConfigurationVersionDiffData,
  type ConfigurationVersionDiffVariables,
  type ConfigurationVersionsData,
  type ConfigurationVersionsVariables,
} from '@/settings/data-model/graphql/configurationVersions';
import { useLingui } from '@lingui/react/macro';
import { IconHistory } from 'twenty-ui/icon';
import { Card } from 'twenty-ui/surfaces';

export const SettingsConfigurationVersions = () => {
  const { t } = useLingui();
  const versionsQuery = useQuery<
    ConfigurationVersionsData,
    ConfigurationVersionsVariables
  >(GET_CONFIGURATION_VERSIONS, {
    variables: { limit: 20 },
    fetchPolicy: 'network-only',
  });
  const [latestVersion, previousVersion] =
    versionsQuery.data?.configurationVersions ?? [];
  const diffQuery = useQuery<
    ConfigurationVersionDiffData,
    ConfigurationVersionDiffVariables
  >(GET_CONFIGURATION_VERSION_DIFF, {
    variables: {
      fromVersionId: previousVersion?.id ?? '',
      toVersionId: latestVersion?.id ?? '',
    },
    skip: latestVersion === undefined || previousVersion === undefined,
    fetchPolicy: 'network-only',
  });

  if (versionsQuery.loading || diffQuery.loading) {
    return null;
  }

  const versions = versionsQuery.data?.configurationVersions ?? [];
  const latestDiff = diffQuery.data?.configurationVersionDiff;

  return (
    <>
      {latestDiff === undefined ? null : (
        <Card rounded>
          <SettingsOptionCardContentButton
            Icon={IconHistory}
            title={`${t`Latest compatibility`} · ${latestDiff.compatibility}`}
            description={`${t`Added`} ${latestDiff.added.length} · ${t`Changed`} ${latestDiff.changed.length} · ${t`Removed`} ${latestDiff.removed.length}`}
            disabled
          />
        </Card>
      )}
      {versions.length === 0 ? (
        <Card rounded>
          <SettingsOptionCardContentButton
            Icon={IconHistory}
            title={t`No configuration versions`}
            description={t`An immutable contract snapshot is recorded after each applied metadata change set.`}
            disabled
          />
        </Card>
      ) : null}
      {versions.map((version) => (
        <Card rounded key={version.id}>
          <SettingsOptionCardContentButton
            Icon={IconHistory}
            title={`${t`Metadata version`} ${version.metadataVersion} · ${version.platformVersion}`}
            description={`${t`Snapshot digest`} ${version.snapshotDigest} · ${t`Change set`} ${version.changeSetId ?? 'baseline'} · ${version.createdAt}`}
            disabled
          />
        </Card>
      ))}
    </>
  );
};
