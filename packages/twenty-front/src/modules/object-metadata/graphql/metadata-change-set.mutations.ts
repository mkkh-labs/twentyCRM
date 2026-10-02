import { gql } from '@apollo/client';

export const PREPARE_METADATA_DELETION_CHANGE_SET = gql`
  mutation PrepareMetadataDeletionChangeSet(
    $input: PrepareMetadataDeletionChangeSetInput!
  ) {
    prepareMetadataDeletionChangeSet(input: $input)
  }
`;

export const PLAN_METADATA_CHANGE_SET = gql`
  mutation PlanMetadataChangeSet($id: String!, $expectedVersion: Int!) {
    planMetadataChangeSet(id: $id, expectedVersion: $expectedVersion)
  }
`;

export const ACKNOWLEDGE_METADATA_CHANGE_SET_DEPENDENCIES = gql`
  mutation AcknowledgeMetadataChangeSetDependencies(
    $id: String!
    $expectedVersion: Int!
  ) {
    acknowledgeMetadataChangeSetDependencies(
      id: $id
      expectedVersion: $expectedVersion
    )
  }
`;

export const VALIDATE_METADATA_CHANGE_SET = gql`
  mutation ValidateMetadataChangeSet($id: String!, $expectedVersion: Int!) {
    validateMetadataChangeSet(id: $id, expectedVersion: $expectedVersion)
  }
`;

export const APPROVE_METADATA_CHANGE_SET = gql`
  mutation ApproveMetadataChangeSet(
    $id: String!
    $expectedVersion: Int!
    $applyToken: String!
  ) {
    approveMetadataChangeSet(
      id: $id
      expectedVersion: $expectedVersion
      applyToken: $applyToken
    )
  }
`;

export const APPLY_METADATA_CHANGE_SET = gql`
  mutation ApplyMetadataChangeSet(
    $id: String!
    $expectedVersion: Int!
    $applyToken: String!
  ) {
    applyMetadataChangeSet(
      id: $id
      expectedVersion: $expectedVersion
      applyToken: $applyToken
    )
  }
`;
