import { gql } from '@apollo/client';

export type OutboxOperationListItem = Readonly<{
  id: string;
  eventType: string;
  schemaVersion: number;
  aggregateType: string;
  aggregateId: string;
  payloadDigest: string;
  rootCorrelationId: string;
  state:
    | 'PENDING'
    | 'DISPATCHING'
    | 'PUBLISHED'
    | 'RETRY_WAIT'
    | 'RECONCILIATION_REQUIRED'
    | 'DEAD';
  attemptCount: number;
  availableAt: string;
  publishedAt: string | null;
  lastErrorCode: string | null;
  createdAt: string;
  recoverySafety: string;
}>;

export type OutboxOperationsData = {
  outboxOperations: readonly OutboxOperationListItem[];
};

export type OutboxOperationsVariables = { limit: number };

export const GET_OUTBOX_OPERATIONS = gql`
  query GetOutboxOperations($limit: Int!) {
    outboxOperations(limit: $limit)
  }
`;
