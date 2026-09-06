import { buildDeterministicDigest } from 'src/engine/core-modules/policy/utils/build-deterministic-digest.util';

export type AgentActionDigestInput = Readonly<{
  workspaceId: string;
  actorId: string;
  action: string;
  target: string;
  arguments: Readonly<Record<string, unknown>>;
  workflowRunId?: string;
  workflowStepId?: string;
}>;

export const buildAgentActionDigest = (input: AgentActionDigestInput): string =>
  buildDeterministicDigest({ schemaVersion: 1, ...input });
