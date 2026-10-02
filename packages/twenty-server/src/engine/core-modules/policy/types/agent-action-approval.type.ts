export type AgentActionApproval = Readonly<{
  id: string;
  workspaceId: string;
  actorId: string;
  actionDigest: string;
  approverId: string;
  expiresAt: string;
  consumedAt: string | null;
}>;
