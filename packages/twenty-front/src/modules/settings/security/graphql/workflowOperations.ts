import { gql } from '@apollo/client';

export type WorkflowOperationListItem = Readonly<{
  id: string;
  workflowRunId: string;
  stepId: string;
  state:
    | 'QUEUED'
    | 'RUNNING'
    | 'SUCCEEDED'
    | 'RETRY_WAIT'
    | 'FAILED_PERMANENT'
    | 'DEAD_LETTERED'
    | 'CANCELLED';
  attemptCount: number;
  retryAt: string | null;
  providerClass: string;
  actionDigest: string;
  providerReferenceDigest: string | null;
  lastErrorCode: string | null;
  uncertaintyReason: string | null;
  createdAt: string;
  updatedAt: string;
  replaySafety: string;
}>;

export type WorkflowOperationsData = {
  workflowOperations: readonly WorkflowOperationListItem[];
};

export type WorkflowOperationsVariables = { limit: number };

export const GET_WORKFLOW_OPERATIONS = gql`
  query GetWorkflowOperations($limit: Int!) {
    workflowOperations(limit: $limit)
  }
`;
