import { gql } from '@apollo/client';

export type ConfigurationVersionListItem = Readonly<{
  id: string;
  metadataVersion: number;
  platformVersion: string;
  changeSetId: string | null;
  snapshotDigest: string;
  createdAt: string;
}>;

export type ConfigurationVersionsData = {
  configurationVersions: readonly ConfigurationVersionListItem[];
};

export type ConfigurationVersionsVariables = { limit: number };

export const GET_CONFIGURATION_VERSIONS = gql`
  query GetConfigurationVersions($limit: Int!) {
    configurationVersions(limit: $limit)
  }
`;

export type ConfigurationVersionDiffData = {
  configurationVersionDiff: {
    added: readonly string[];
    changed: readonly string[];
    removed: readonly string[];
    compatibility: 'BACKWARD_COMPATIBLE' | 'REVIEW_REQUIRED' | 'BREAKING';
  };
};

export type ConfigurationVersionDiffVariables = {
  fromVersionId: string;
  toVersionId: string;
};

export const GET_CONFIGURATION_VERSION_DIFF = gql`
  query GetConfigurationVersionDiff(
    $fromVersionId: String!
    $toVersionId: String!
  ) {
    configurationVersionDiff(
      fromVersionId: $fromVersionId
      toVersionId: $toVersionId
    )
  }
`;
