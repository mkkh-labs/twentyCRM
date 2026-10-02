import { buildWorkflowEffectKey } from 'src/engine/core-modules/workflow-reliability/utils/build-workflow-effect-key.util';

describe('buildWorkflowEffectKey', () => {
  it('is deterministic and changes across distinct effects', () => {
    const first = buildWorkflowEffectKey({
      workspaceId: '11111111-1111-4111-8111-111111111111',
      workflowRunId: '22222222-2222-4222-8222-222222222222',
      stepId: 'send-email',
      actionDigest: 'a'.repeat(64),
    });

    expect(first).toBe(
      buildWorkflowEffectKey({
        workspaceId: '11111111-1111-4111-8111-111111111111',
        workflowRunId: '22222222-2222-4222-8222-222222222222',
        stepId: 'send-email',
        actionDigest: 'a'.repeat(64),
      }),
    );
    expect(first).not.toBe(
      buildWorkflowEffectKey({
        workspaceId: '11111111-1111-4111-8111-111111111111',
        workflowRunId: '22222222-2222-4222-8222-222222222222',
        stepId: 'send-email',
        actionDigest: 'b'.repeat(64),
      }),
    );
  });
});
