import { buildAgentActionDigest } from 'src/engine/core-modules/policy/utils/build-agent-action-digest.util';

describe('buildAgentActionDigest', () => {
  const action = {
    workspaceId: '11111111-1111-4111-8111-111111111111',
    actorId: '22222222-2222-4222-8222-222222222222',
    action: 'database.update_many',
    target: 'database:person',
    arguments: { filter: { id: { in: ['b', 'a'] } }, data: { city: 'NYC' } },
  };

  it('is stable across key and set-like array order', () => {
    expect(buildAgentActionDigest(action)).toBe(
      buildAgentActionDigest({
        ...action,
        arguments: {
          data: { city: 'NYC' },
          filter: { id: { in: ['a', 'b'] } },
        },
      }),
    );
  });

  it('changes when materially relevant arguments change', () => {
    expect(buildAgentActionDigest(action)).not.toBe(
      buildAgentActionDigest({
        ...action,
        arguments: { ...action.arguments, data: { city: 'Boston' } },
      }),
    );
  });
});
