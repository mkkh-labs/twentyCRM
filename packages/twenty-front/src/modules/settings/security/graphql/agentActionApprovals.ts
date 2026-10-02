import { gql } from '@apollo/client';

export const GET_PENDING_AGENT_ACTION_APPROVAL_REQUESTS = gql`
  query PendingAgentActionApprovalRequests {
    pendingAgentActionApprovalRequests {
      id
      actorId
      action
      target
      riskClass
      actionDigest
      expiresAt
      createdAt
    }
  }
`;

export const APPROVE_AGENT_ACTION_REQUEST = gql`
  mutation ApproveAgentActionRequest($input: ApproveAgentActionRequestInput!) {
    approveAgentActionRequest(input: $input) {
      id
      action
      target
      riskClass
      actionDigest
      expiresAt
    }
  }
`;

export const DENY_AGENT_ACTION_REQUEST = gql`
  mutation DenyAgentActionRequest($requestId: ID!) {
    denyAgentActionRequest(requestId: $requestId) {
      id
      status
    }
  }
`;

export type AgentActionApprovalRequest = {
  id: string;
  actorId: string;
  action: string;
  target: string;
  riskClass: string;
  actionDigest: string;
  expiresAt: string;
  createdAt: string;
};

export type PendingAgentActionApprovalRequestsData = {
  pendingAgentActionApprovalRequests: AgentActionApprovalRequest[];
};

export type ApproveAgentActionRequestVariables = {
  input: {
    requestId: string;
    expiresAt: string;
  };
};

export type DenyAgentActionRequestVariables = {
  requestId: string;
};
