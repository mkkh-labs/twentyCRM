import { isDefined } from 'twenty-shared/utils';

import { type ScopedRolePermissionConfig } from 'src/engine/core-modules/policy/types/policy-context.type';

export const buildAgentRolePermissionConfig = ({
  agentRoleId,
  runAsRoleId,
}: {
  agentRoleId: string;
  runAsRoleId?: string;
}): ScopedRolePermissionConfig => {
  if (isDefined(runAsRoleId)) {
    return { intersectionOf: [...new Set([agentRoleId, runAsRoleId])] };
  }

  return { intersectionOf: [agentRoleId] };
};
