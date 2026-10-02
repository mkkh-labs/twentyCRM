import { buildDeterministicDigest } from 'src/engine/core-modules/policy/utils/build-deterministic-digest.util';

export type WorkflowEffectIdentity = Readonly<{
  workspaceId: string;
  workflowRunId: string;
  stepId: string;
  actionDigest: string;
}>;

export const buildWorkflowEffectKey = (
  identity: WorkflowEffectIdentity,
): string => buildDeterministicDigest({ schemaVersion: 1, ...identity });
