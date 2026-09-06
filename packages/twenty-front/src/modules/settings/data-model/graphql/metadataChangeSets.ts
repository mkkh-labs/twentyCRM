import { gql } from '@apollo/client';

export type MetadataChangeSetListItem = Readonly<{
  id: string;
  state:
    | 'DRAFT'
    | 'PLANNED'
    | 'VALIDATED'
    | 'APPROVED'
    | 'APPLYING'
    | 'APPLIED'
    | 'FAILED'
    | 'ROLLBACK_PENDING'
    | 'ROLLED_BACK'
    | 'FORWARD_FIXED';
  baseMetadataVersion: number;
  appliedMetadataVersion: number | null;
  operations: readonly Readonly<{
    operation: 'CREATE' | 'UPDATE' | 'DELETE';
    metadataType: string;
    universalIdentifier: string;
    payloadDigest: string;
  }>[];
  recoveryStrategy: 'ROLLBACK' | 'FORWARD_FIX' | null;
  riskClass: 'R1' | 'R2' | 'R3' | null;
  compatibilityFindings: readonly string[];
  dependencyImpact: Readonly<{
    workflows: readonly string[];
    views: readonly string[];
    applications: readonly string[];
    contracts: readonly string[];
    metadata: readonly string[];
  }>;
  createdByActorId: string;
  approvedByActorId: string | null;
  failureCode: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}>;

export type MetadataChangeSetsData = {
  metadataChangeSets: readonly MetadataChangeSetListItem[];
};

export type MetadataChangeSetsVariables = { limit: number };

export const GET_METADATA_CHANGE_SETS = gql`
  query GetMetadataChangeSets($limit: Int!) {
    metadataChangeSets(limit: $limit)
  }
`;

export type RollbackMetadataChangeSetVariables = {
  id: string;
  expectedVersion: number;
  from: 'APPLIED' | 'FAILED';
  rollbackToken: string;
  approvalId: string;
};

export type ApproveMetadataChangeSetRollbackVariables = Omit<
  RollbackMetadataChangeSetVariables,
  'rollbackToken' | 'approvalId'
>;

export type ApproveMetadataChangeSetRollbackData = {
  approveMetadataChangeSetRollback: {
    approvalId: string;
    rollbackToken: string;
    expiresAt: string;
    version: number;
  };
};

export const APPROVE_METADATA_CHANGE_SET_ROLLBACK = gql`
  mutation ApproveMetadataChangeSetRollback(
    $id: String!
    $expectedVersion: Int!
    $from: String!
  ) {
    approveMetadataChangeSetRollback(
      id: $id
      expectedVersion: $expectedVersion
      from: $from
    )
  }
`;

export type RollbackMetadataChangeSetData = {
  rollbackMetadataChangeSet: {
    status: 'SUCCEEDED' | 'RECONCILIATION_REQUIRED';
  };
};

export const ROLLBACK_METADATA_CHANGE_SET = gql`
  mutation RollbackMetadataChangeSet(
    $id: String!
    $expectedVersion: Int!
    $from: String!
    $rollbackToken: String!
    $approvalId: String!
  ) {
    rollbackMetadataChangeSet(
      id: $id
      expectedVersion: $expectedVersion
      from: $from
      rollbackToken: $rollbackToken
      approvalId: $approvalId
    )
  }
`;
