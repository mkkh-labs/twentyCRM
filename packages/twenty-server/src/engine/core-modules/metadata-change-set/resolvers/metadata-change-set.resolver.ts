import { randomUUID } from 'node:crypto';

import { Args, Int, Mutation, Query } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';

import GraphQLJSON from 'graphql-type-json';
import { PermissionFlagType } from 'twenty-shared/constants';

import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { CreateMetadataChangeSetInput } from 'src/engine/core-modules/metadata-change-set/dtos/create-metadata-change-set.input';
import { PrepareMetadataDeletionChangeSetInput } from 'src/engine/core-modules/metadata-change-set/dtos/prepare-metadata-deletion-change-set.input';
import { MetadataChangeSetApplyService } from 'src/engine/core-modules/metadata-change-set/services/metadata-change-set-apply.service';
import { MetadataChangeSetService } from 'src/engine/core-modules/metadata-change-set/services/metadata-change-set.service';
import { MetadataDeletionPlanService } from 'src/engine/core-modules/metadata-change-set/services/metadata-deletion-plan.service';
import { PolicyContextService } from 'src/engine/core-modules/policy/services/policy-context.service';
import { PolicyCorrelationService } from 'src/engine/core-modules/policy/services/policy-correlation.service';
import { PolicyDecisionService } from 'src/engine/core-modules/policy/services/policy-decision.service';
import {
  type PolicyActor,
  type PolicyContext,
  type PolicyRiskClass,
} from 'src/engine/core-modules/policy/types/policy-context.type';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { type AllFlatEntityOperationRecordByMetadataName } from 'src/engine/metadata-modules/flat-entity/types/all-flat-entity-operation-record-by-metadata-name.type';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';

@CoreResolver()
@UseGuards(
  WorkspaceAuthGuard,
  SettingsPermissionGuard(PermissionFlagType.DATA_MODEL),
)
export class MetadataChangeSetResolver {
  constructor(
    private readonly changeSetService: MetadataChangeSetService,
    private readonly changeSetApplyService: MetadataChangeSetApplyService,
    private readonly metadataDeletionPlanService: MetadataDeletionPlanService,
    private readonly workspaceOrmManager: WorkspaceOrmManager,
    private readonly policyContextService: PolicyContextService,
    private readonly policyCorrelationService: PolicyCorrelationService,
    private readonly policyDecisionService: PolicyDecisionService,
  ) {}

  @Query(() => GraphQLJSON)
  async metadataChangeSets(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('limit', { type: () => Int, defaultValue: 50 }) limit: number,
  ) {
    this.getCallerBoundAuthContext(workspace.id);
    const changeSets = await this.changeSetService.list({
      workspaceId: workspace.id,
      limit,
    });

    return changeSets.map((changeSet) => ({
      id: changeSet.id,
      state: changeSet.state,
      baseMetadataVersion: changeSet.baseMetadataVersion,
      appliedMetadataVersion: changeSet.appliedMetadataVersion,
      operations: changeSet.operations,
      recoveryStrategy: changeSet.recoveryStrategy,
      riskClass: changeSet.riskClass,
      compatibilityFindings: changeSet.compatibilityFindings,
      dependencyImpact: changeSet.dependencyImpact,
      createdByActorId: changeSet.createdByActorId,
      approvedByActorId: changeSet.approvedByActorId,
      failureCode: changeSet.failureCode,
      version: changeSet.version,
      createdAt: changeSet.createdAt,
      updatedAt: changeSet.updatedAt,
    }));
  }

  @Mutation(() => GraphQLJSON)
  async prepareMetadataDeletionChangeSet(
    @Args('input') input: PrepareMetadataDeletionChangeSetInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ) {
    const authContext = this.getCallerBoundAuthContext(workspace.id);
    const plan = await this.metadataDeletionPlanService.build({
      workspaceId: workspace.id,
      targetType: input.targetType,
      targetId: input.targetId,
    });
    const changeSet = await this.changeSetService.createDraft({
      id: randomUUID(),
      workspaceId: workspace.id,
      baseMetadataVersion: workspace.metadataVersion,
      createdByActorId: this.getActorId(authContext),
      operations: [],
      migrationPlan: plan.migrationPlan,
      applicationUniversalIdentifier: plan.applicationUniversalIdentifier,
      rollbackPlan: plan.rollbackPlan,
      recoveryStrategy: 'ROLLBACK',
    });

    return {
      id: changeSet.id,
      state: changeSet.state,
      version: changeSet.version,
    };
  }

  @Mutation(() => GraphQLJSON)
  async createMetadataChangeSet(
    @Args('input') input: CreateMetadataChangeSetInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ) {
    const authContext = this.getCallerBoundAuthContext(workspace.id);
    const changeSet = await this.changeSetService.createDraft({
      id: randomUUID(),
      workspaceId: workspace.id,
      baseMetadataVersion: input.baseMetadataVersion,
      createdByActorId: this.getActorId(authContext),
      operations: [],
      migrationPlan:
        input.migrationPlan as AllFlatEntityOperationRecordByMetadataName,
      applicationUniversalIdentifier: input.applicationUniversalIdentifier,
      ...(input.rollbackPlan === undefined
        ? {}
        : {
            rollbackPlan:
              input.rollbackPlan as AllFlatEntityOperationRecordByMetadataName,
          }),
      ...(input.recoveryStrategy === undefined
        ? {}
        : { recoveryStrategy: input.recoveryStrategy }),
      ...(input.dependencyResolutionDigest === undefined
        ? {}
        : {
            dependencyResolutionDigest: input.dependencyResolutionDigest,
          }),
    });

    return {
      id: changeSet.id,
      state: changeSet.state,
      version: changeSet.version,
    };
  }

  @Mutation(() => GraphQLJSON)
  async planMetadataChangeSet(
    @Args('id') id: string,
    @Args('expectedVersion', { type: () => Int }) expectedVersion: number,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ) {
    this.getCallerBoundAuthContext(workspace.id);

    const dependencyImpact = await this.changeSetService.plan({
      workspaceId: workspace.id,
      id,
      expectedVersion,
    });

    return {
      dependencyImpact,
      state: 'PLANNED',
      version: expectedVersion + 1,
    };
  }

  @Mutation(() => GraphQLJSON)
  async acknowledgeMetadataChangeSetDependencies(
    @Args('id') id: string,
    @Args('expectedVersion', { type: () => Int }) expectedVersion: number,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ) {
    const authContext = this.getCallerBoundAuthContext(workspace.id);

    if (authContext.type !== 'user') {
      throw new Error(
        'Metadata dependency acknowledgement requires a human workspace member.',
      );
    }

    return this.changeSetService.acknowledgeDependencies({
      workspaceId: workspace.id,
      id,
      expectedVersion,
    });
  }

  @Mutation(() => GraphQLJSON)
  async validateMetadataChangeSet(
    @Args('id') id: string,
    @Args('expectedVersion', { type: () => Int }) expectedVersion: number,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ) {
    this.getCallerBoundAuthContext(workspace.id);

    const validation = await this.changeSetService.validate({
      workspaceId: workspace.id,
      id,
      expectedVersion,
    });

    return {
      ...validation,
      state: 'VALIDATED',
      version: expectedVersion + 1,
    };
  }

  @Mutation(() => Boolean)
  async approveMetadataChangeSet(
    @Args('id') id: string,
    @Args('expectedVersion', { type: () => Int }) expectedVersion: number,
    @Args('applyToken') applyToken: string,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<boolean> {
    const authContext = this.getCallerBoundAuthContext(workspace.id);

    if (authContext.type !== 'user') {
      throw new Error('Metadata approval requires a human workspace member.');
    }

    await this.changeSetService.approve({
      workspaceId: workspace.id,
      id,
      expectedVersion,
      applyToken,
      approverActorId: authContext.user.id,
    });

    return true;
  }

  @Mutation(() => GraphQLJSON)
  async applyMetadataChangeSet(
    @Args('id') id: string,
    @Args('expectedVersion', { type: () => Int }) expectedVersion: number,
    @Args('applyToken') applyToken: string,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ) {
    const authContext = this.getHumanCallerBoundAuthContext(workspace.id);
    const changeSet = await this.changeSetService.findOneOrThrow(
      workspace.id,
      id,
    );

    if (changeSet.approvalId === null) {
      throw new Error('Metadata change set has no durable approval identity.');
    }

    await this.changeSetService.validateApplyApproval({
      workspaceId: workspace.id,
      id,
      expectedVersion,
      applyToken,
      actorId: authContext.user.id,
      approvalId: changeSet.approvalId,
    });
    const context = await this.buildPolicyContext({
      workspace,
      id,
      riskClass: this.getRiskClass(changeSet.riskClass),
      operation: 'metadata.changeSet.apply',
    });
    const decision = this.policyDecisionService.create({
      context,
      outcome: 'ALLOW',
      reasonCodes: ['AUTHORIZED'],
    });

    return this.changeSetApplyService.apply({
      workspaceId: workspace.id,
      id,
      expectedVersion,
      applyToken,
      approvalId: changeSet.approvalId,
      context,
      decision,
    });
  }

  @Mutation(() => GraphQLJSON)
  async approveMetadataChangeSetRollback(
    @Args('id') id: string,
    @Args('expectedVersion', { type: () => Int }) expectedVersion: number,
    @Args('from') from: 'APPLIED' | 'FAILED',
    @AuthWorkspace() workspace: WorkspaceEntity,
  ) {
    if (from !== 'APPLIED' && from !== 'FAILED') {
      throw new Error('Metadata rollback source state is invalid.');
    }

    const authContext = this.getHumanCallerBoundAuthContext(workspace.id);

    return this.changeSetService.approveRollback({
      workspaceId: workspace.id,
      id,
      from,
      expectedVersion,
      approverActorId: authContext.user.id,
    });
  }

  @Mutation(() => GraphQLJSON)
  async rollbackMetadataChangeSet(
    @Args('id') id: string,
    @Args('expectedVersion', { type: () => Int }) expectedVersion: number,
    @Args('from') from: 'APPLIED' | 'FAILED',
    @Args('rollbackToken') rollbackToken: string,
    @Args('approvalId') approvalId: string,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ) {
    if (from !== 'APPLIED' && from !== 'FAILED') {
      throw new Error('Metadata rollback source state is invalid.');
    }

    const authContext = this.getHumanCallerBoundAuthContext(workspace.id);
    const changeSet = await this.changeSetService.findOneOrThrow(
      workspace.id,
      id,
    );
    await this.changeSetService.validateRollbackApproval({
      workspaceId: workspace.id,
      id,
      from,
      expectedVersion,
      rollbackToken,
      actorId: authContext.user.id,
      approvalId,
    });
    const context = await this.buildPolicyContext({
      workspace,
      id,
      riskClass: this.getRiskClass(changeSet.riskClass),
      operation: 'metadata.changeSet.rollback',
    });
    const decision = this.policyDecisionService.create({
      context,
      outcome: 'ALLOW',
      reasonCodes: ['AUTHORIZED'],
    });

    return this.changeSetApplyService.rollback({
      workspaceId: workspace.id,
      id,
      expectedVersion,
      from,
      rollbackToken,
      approvalId,
      context,
      decision,
    });
  }

  private getCallerBoundAuthContext(workspaceId: string): WorkspaceAuthContext {
    const authContext = getWorkspaceAuthContext();

    if (
      authContext.type !== 'user' &&
      authContext.type !== 'apiKey' &&
      authContext.type !== 'application'
    ) {
      throw new Error('Metadata changes require a caller-bound identity.');
    }

    if (authContext.workspace.id !== workspaceId) {
      throw new Error('Metadata change-set caller workspace is mismatched.');
    }

    return authContext;
  }

  private getHumanCallerBoundAuthContext(
    workspaceId: string,
  ): Extract<WorkspaceAuthContext, { type: 'user' }> {
    const authContext = this.getCallerBoundAuthContext(workspaceId);

    if (authContext.type !== 'user') {
      throw new Error(
        'Metadata change-set execution requires a human workspace member.',
      );
    }

    return authContext;
  }

  private getActorId(authContext: WorkspaceAuthContext): string {
    if (authContext.type === 'user') {
      return authContext.user.id;
    }
    if (authContext.type === 'apiKey') {
      return authContext.apiKey.id;
    }
    if (authContext.type === 'application') {
      return authContext.application.id;
    }

    throw new Error('Metadata changes require a caller-bound identity.');
  }

  private getPolicyActor(authContext: WorkspaceAuthContext): PolicyActor {
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

    throw new Error('Metadata changes require a caller-bound identity.');
  }

  private async buildPolicyContext({
    workspace,
    id,
    riskClass,
    operation,
  }: {
    workspace: WorkspaceEntity;
    id: string;
    riskClass: PolicyRiskClass;
    operation: 'metadata.changeSet.apply' | 'metadata.changeSet.rollback';
  }): Promise<PolicyContext> {
    const authContext = this.getCallerBoundAuthContext(workspace.id);
    const rolePermissionConfig =
      await this.workspaceOrmManager.resolveRolePermissionConfigForAuthContext(
        authContext,
      );

    if (
      rolePermissionConfig === null ||
      'shouldBypassPermissionChecks' in rolePermissionConfig
    ) {
      throw new Error('Metadata change-set authority is unresolved.');
    }

    return this.policyContextService.create({
      workspaceId: workspace.id,
      actor: this.getPolicyActor(authContext),
      authority: {
        type: 'roles',
        source:
          authContext.type === 'application'
            ? 'DELEGATED_APPLICATION'
            : 'CALLER_BOUND',
        workspaceId: workspace.id,
        authorityVersion: `metadata-${workspace.metadataVersion}`,
        revocationState: 'ACTIVE',
        evaluatedAt: new Date().toISOString(),
        rolePermissionConfig,
      },
      operation,
      riskClass,
      target: {
        workspaceId: workspace.id,
        resourceType: 'metadataChangeSet',
        resourceId: id,
      },
      affectedFieldMetadataIds: [],
      correlation: this.policyCorrelationService.createAttempt(),
    });
  }

  private getRiskClass(riskClass: 'R1' | 'R2' | 'R3' | null): PolicyRiskClass {
    if (riskClass === null) {
      throw new Error('Metadata change set has not been validated.');
    }

    return riskClass;
  }
}
