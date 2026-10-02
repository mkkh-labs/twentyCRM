import { Injectable } from '@nestjs/common';

import { PermissionFlagType } from 'twenty-shared/constants';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { PolicyContextService } from 'src/engine/core-modules/policy/services/policy-context.service';
import { PolicyCorrelationService } from 'src/engine/core-modules/policy/services/policy-correlation.service';
import { PolicyDecisionService } from 'src/engine/core-modules/policy/services/policy-decision.service';
import { ProtectedOperationService } from 'src/engine/core-modules/policy/services/protected-operation.service';
import {
  type PolicyActor,
  type PolicyRiskClass,
} from 'src/engine/core-modules/policy/types/policy-context.type';
import { buildDeterministicDigest } from 'src/engine/core-modules/policy/utils/build-deterministic-digest.util';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';

type CampaignPolicyOperation =
  | 'campaign.send.enqueue'
  | 'campaign.send.materialize'
  | 'campaign.email.send'
  | 'campaign.test.send'
  | 'email.send.direct';

type CampaignPolicyBinding = Readonly<{
  rootCorrelationId: string;
  policyDecisionId: string;
}>;

type ExecuteCampaignPolicyInput<TResult> = Readonly<{
  authContext: WorkspaceAuthContext;
  workspaceId: string;
  operation: CampaignPolicyOperation;
  riskClass: PolicyRiskClass;
  targetResourceType:
    | 'emailingDomain'
    | 'messageCampaign'
    | 'messageCampaignTest';
  targetResourceId?: string;
  targetCount?: number;
  actionArguments: Readonly<Record<string, unknown>>;
  rootCorrelationId?: string;
  parentDecisionId?: string;
  jobId?: string;
  mutationOrEffectId?: string;
  execute: (binding: CampaignPolicyBinding) => Promise<TResult>;
  getProviderReference?: (result: TResult) => string | undefined;
}>;

type CampaignPolicyResult<TResult> = Readonly<{
  value: TResult;
  rootCorrelationId: string;
  policyDecisionId: string;
}>;

export class CampaignPolicyReconciliationRequiredError extends Error {}

@Injectable()
export class MessageCampaignPolicyService {
  constructor(
    private readonly workspaceOrmManager: WorkspaceOrmManager,
    private readonly permissionsService: PermissionsService,
    private readonly policyContextService: PolicyContextService,
    private readonly policyCorrelationService: PolicyCorrelationService,
    private readonly policyDecisionService: PolicyDecisionService,
    private readonly protectedOperationService: ProtectedOperationService,
  ) {}

  async execute<TResult>({
    authContext,
    workspaceId,
    operation,
    riskClass,
    targetResourceType,
    targetResourceId,
    targetCount,
    actionArguments,
    rootCorrelationId,
    parentDecisionId,
    jobId,
    mutationOrEffectId,
    execute,
    getProviderReference,
  }: ExecuteCampaignPolicyInput<TResult>): Promise<
    CampaignPolicyResult<TResult>
  > {
    if (
      authContext.workspace.id !== workspaceId ||
      authContext.type === 'system' ||
      authContext.type === 'pendingActivationUser'
    ) {
      throw new Error('Campaign authority workspace is mismatched.');
    }

    const hasWorkspacePermission =
      await this.permissionsService.userHasWorkspaceSettingPermission({
        setting: PermissionFlagType.WORKSPACE,
        workspaceId,
        ...(authContext.type === 'user'
          ? { userWorkspaceId: authContext.userWorkspaceId }
          : {}),
        ...(authContext.type === 'apiKey'
          ? { apiKeyId: authContext.apiKey.id }
          : {}),
        ...(authContext.type === 'application'
          ? { applicationId: authContext.application.id }
          : {}),
      });

    if (!hasWorkspacePermission) {
      throw new Error('Campaign workspace permission is not active.');
    }

    const rolePermissionConfig =
      await this.workspaceOrmManager.resolveRolePermissionConfigForAuthContext(
        authContext,
      );

    if (
      rolePermissionConfig === null ||
      'shouldBypassPermissionChecks' in rolePermissionConfig
    ) {
      throw new Error('Campaign authority is unresolved.');
    }

    const correlation = this.policyCorrelationService.createAttempt({
      rootCorrelationId,
      jobId,
      mutationOrEffectId,
    });
    const context = this.policyContextService.create({
      workspaceId,
      actor: this.getActor(authContext),
      authority: {
        type: 'roles',
        source:
          authContext.type === 'application' ||
          (authContext.type === 'user' && authContext.application !== undefined)
            ? 'DELEGATED_APPLICATION'
            : 'CALLER_BOUND',
        workspaceId,
        authorityVersion: `campaign-metadata-${authContext.workspace.metadataVersion}`,
        revocationState: 'ACTIVE',
        evaluatedAt: new Date().toISOString(),
        rolePermissionConfig,
      },
      operation,
      riskClass,
      target: {
        workspaceId,
        resourceType: targetResourceType,
        ...(targetResourceId === undefined
          ? {}
          : { resourceId: targetResourceId }),
      },
      affectedFieldMetadataIds: [],
      correlation,
    });
    const decision = this.policyDecisionService.create({
      context,
      outcome: 'ALLOW',
      reasonCodes: ['AUTHORIZED'],
      parentDecisionId,
    });
    const argumentDigest = buildDeterministicDigest(actionArguments);
    const result = await this.protectedOperationService.execute({
      context,
      decision,
      auditMetadata: {
        argumentDigest,
        ...(targetCount === undefined ? {} : { targetCount }),
      },
      execute: () =>
        execute({
          rootCorrelationId: correlation.rootCorrelationId,
          policyDecisionId: decision.id,
        }),
      getProviderReference,
    });

    if (result.status === 'RECONCILIATION_REQUIRED') {
      throw new CampaignPolicyReconciliationRequiredError(
        'Campaign operation requires reconciliation after protected execution.',
      );
    }

    if (result.status === 'DENIED') {
      throw new Error('Campaign operation was denied before execution.');
    }

    return {
      value: result.value,
      rootCorrelationId: correlation.rootCorrelationId,
      policyDecisionId: decision.id,
    };
  }

  private getActor(authContext: WorkspaceAuthContext): PolicyActor {
    if (authContext.type === 'user') {
      return {
        type: 'user',
        id: authContext.user.id,
        workspaceId: authContext.workspace.id,
        workspaceMemberId: authContext.workspaceMemberId,
        ...(authContext.application === undefined
          ? {}
          : { applicationId: authContext.application.id }),
      };
    }

    if (authContext.type === 'apiKey') {
      return {
        type: 'apiKey',
        id: authContext.apiKey.id,
        workspaceId: authContext.workspace.id,
      };
    }

    if (authContext.type === 'application') {
      return {
        type: 'application',
        id: authContext.application.id,
        workspaceId: authContext.workspace.id,
      };
    }

    throw new Error('Campaign authority requires a caller-bound identity.');
  }
}
