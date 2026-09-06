import { buildAgentRolePermissionConfig } from 'src/engine/metadata-modules/ai/ai-agent-execution/utils/build-agent-role-permission-config.util';

describe('buildAgentRolePermissionConfig', () => {
  it('keeps the agent role alone when there is no run-as role', () => {
    expect(
      buildAgentRolePermissionConfig({ agentRoleId: 'agent-role-id' }),
    ).toEqual({ intersectionOf: ['agent-role-id'] });
  });

  it('intersects the agent and member roles in run-as mode', () => {
    expect(
      buildAgentRolePermissionConfig({
        agentRoleId: 'agent-role-id',
        runAsRoleId: 'run-as-role-id',
      }),
    ).toEqual({ intersectionOf: ['agent-role-id', 'run-as-role-id'] });
  });

  it('deduplicates the intersection when both roles are the same', () => {
    expect(
      buildAgentRolePermissionConfig({
        agentRoleId: 'agent-role-id',
        runAsRoleId: 'agent-role-id',
      }),
    ).toEqual({ intersectionOf: ['agent-role-id'] });
  });
});
