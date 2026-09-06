import { resolveAgentAction } from 'src/engine/core-modules/policy/utils/resolve-agent-action.util';

describe('resolveAgentAction', () => {
  it.each([
    ['find_many', 'R0'],
    ['find_one', 'R0'],
    ['group_by', 'R0'],
    ['create_one', 'R1'],
    ['update_one', 'R1'],
    ['create_many', 'R2'],
    ['update_many', 'R2'],
    ['upsert_many', 'R2'],
    ['delete_one', 'R3'],
    ['delete_many', 'R3'],
  ] as const)(
    'classifies database operation %s as %s',
    (operation, riskClass) => {
      expect(
        resolveAgentAction({
          kind: 'database_crud',
          objectNameSingular: 'person',
          operation,
        }),
      ).toMatchObject({ riskClass, action: `database.${operation}` });
    },
  );

  it('classifies unknown static tools as privileged without reading annotations', () => {
    expect(
      resolveAgentAction({ kind: 'static', toolId: 'unregistered_tool' }),
    ).toEqual({
      action: 'static.unregistered_tool',
      target: 'static:unregistered_tool',
      riskClass: 'R3',
    });
  });

  it.each([
    ['search_help_center', 'R0'],
    ['draft_email', 'R2'],
    ['send_email', 'R2'],
    ['create_calendar_event', 'R2'],
    ['http_request', 'R3'],
  ] as const)(
    'classifies static tool %s from the server registry as %s',
    (toolId, riskClass) => {
      expect(resolveAgentAction({ kind: 'static', toolId })).toMatchObject({
        riskClass,
      });
    },
  );
});
