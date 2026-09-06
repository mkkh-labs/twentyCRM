import { isDefined } from 'twenty-shared/utils';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import {
  PolicyException,
  PolicyExceptionCode,
} from 'src/engine/core-modules/policy/policy.exception';
import {
  type PolicyActor,
  type PolicyAuthority,
  type ScopedRolePermissionConfig,
} from 'src/engine/core-modules/policy/types/policy-context.type';

export type ResolveToolPolicyIdentityInput = Readonly<{
  workspaceId: string;
  roleId: string;
  rolePermissionConfig: ScopedRolePermissionConfig;
  authContext: WorkspaceAuthContext;
  serviceAuthorityId?: string;
  operation: string;
}>;

export type ResolvedToolPolicyIdentity = Readonly<{
  actor: PolicyActor;
  authority: PolicyAuthority;
}>;

export const resolveToolPolicyIdentity = ({
  workspaceId,
  roleId,
  rolePermissionConfig,
  authContext,
  serviceAuthorityId,
  operation,
}: ResolveToolPolicyIdentityInput): ResolvedToolPolicyIdentity => {
  if (authContext.workspace.id !== workspaceId) {
    throw new PolicyException(
      'Tool identity belongs to another workspace.',
      PolicyExceptionCode.CONTEXT_INVALID,
    );
  }

  if ('shouldBypassPermissionChecks' in rolePermissionConfig) {
    throw new PolicyException(
      'Permission bypass is forbidden for tool execution.',
      PolicyExceptionCode.BYPASS_FORBIDDEN,
    );
  }

  const evaluatedAt = new Date().toISOString();

  if (authContext.type === 'system') {
    if (!isDefined(serviceAuthorityId)) {
      throw new PolicyException(
        'System tool execution requires scoped service authority.',
        PolicyExceptionCode.CONTEXT_INVALID,
      );
    }

    return {
      actor: {
        type: 'system',
        id: null,
        workspaceId,
        serviceAuthorityId,
      },
      authority: {
        type: 'service',
        source: 'SCOPED_SERVICE_PRINCIPAL',
        serviceAuthorityId,
        workspaceId,
        authorityVersion: `service:${serviceAuthorityId}`,
        revocationState: 'ACTIVE',
        evaluatedAt,
        allowedOperations: [operation],
        maximumRiskClass: 'R0',
      },
    };
  }

  if (authContext.type === 'pendingActivationUser') {
    throw new PolicyException(
      'Pending users cannot execute tools.',
      PolicyExceptionCode.CONTEXT_INVALID,
    );
  }

  const authority = {
    type: 'roles' as const,
    source:
      authContext.type === 'application' ||
      (authContext.type === 'user' &&
        (isDefined(authContext.application) ||
          isDefined(authContext.viaApplication)))
        ? ('DELEGATED_APPLICATION' as const)
        : ('CALLER_BOUND' as const),
    rolePermissionConfig,
    workspaceId,
    authorityVersion: `role:${roleId}`,
    revocationState: 'ACTIVE' as const,
    evaluatedAt,
  };

  if (authContext.type === 'user') {
    return {
      actor: {
        type: 'user',
        id: authContext.user.id,
        workspaceId,
        workspaceMemberId: authContext.workspaceMemberId,
        ...(isDefined(authContext.application)
          ? { applicationId: authContext.application.id }
          : isDefined(authContext.viaApplication)
            ? { applicationId: authContext.viaApplication.id }
            : {}),
      },
      authority,
    };
  }

  if (authContext.type === 'apiKey') {
    return {
      actor: {
        type: 'apiKey',
        id: authContext.apiKey.id,
        workspaceId,
      },
      authority,
    };
  }

  return {
    actor: {
      type: 'application',
      id: authContext.application.id,
      workspaceId,
    },
    authority,
  };
};
