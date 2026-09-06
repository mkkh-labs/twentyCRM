import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isDefined } from 'twenty-shared/utils';
import { Repository } from 'typeorm';

import { ConfigurationVersionService } from 'src/engine/core-modules/configuration-version/services/configuration-version.service';
import { ConfigurationSnapshotService } from 'src/engine/core-modules/configuration-version/services/configuration-snapshot.service';
import { MetadataChangeSetService } from 'src/engine/core-modules/metadata-change-set/services/metadata-change-set.service';
import { ProtectedOperationService } from 'src/engine/core-modules/policy/services/protected-operation.service';
import { type PolicyContext } from 'src/engine/core-modules/policy/types/policy-context.type';
import { type PolicyDecision } from 'src/engine/core-modules/policy/types/policy-decision.type';
import { buildDeterministicDigest } from 'src/engine/core-modules/policy/utils/build-deterministic-digest.util';
import { TWENTY_CURRENT_VERSION } from 'src/engine/core-modules/upgrade/constants/twenty-current-version.constant';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { WorkspaceMetadataVersionService } from 'src/engine/metadata-modules/workspace-metadata-version/services/workspace-metadata-version.service';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';
import { withDestructiveMetadataChangeExecutionContext } from 'src/engine/workspace-manager/workspace-migration/storage/destructive-metadata-change-execution-context.storage';

@Injectable()
export class MetadataChangeSetApplyService {
  constructor(
    private readonly changeSetService: MetadataChangeSetService,
    private readonly workspaceMigrationService: WorkspaceMigrationValidateBuildAndRunService,
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    private readonly workspaceMetadataVersionService: WorkspaceMetadataVersionService,
    private readonly configurationVersionService: ConfigurationVersionService,
    private readonly configurationSnapshotService: ConfigurationSnapshotService,
    private readonly protectedOperationService: ProtectedOperationService,
  ) {}

  async apply({
    workspaceId,
    id,
    expectedVersion,
    applyToken,
    approvalId,
    context,
    decision,
  }: Readonly<{
    workspaceId: string;
    id: string;
    expectedVersion: number;
    applyToken: string;
    approvalId: string;
    context: PolicyContext;
    decision: PolicyDecision;
  }>) {
    this.assertPolicyBinding({ workspaceId, id, context });
    const actorId = this.getHumanActorId(context);
    let terminalState: 'APPLIED' | 'FAILED' | 'ROLLBACK_PENDING' | undefined;

    const result = await this.protectedOperationService.execute({
      context,
      decision,
      auditMetadata: {
        targetCount: 1,
        argumentDigest: buildDeterministicDigest({ id, expectedVersion }),
        payloadClassification: 'CONTROL',
        approvalId,
      },
      execute: async () => {
        const changeSet = await this.changeSetService.beginApply({
          workspaceId,
          id,
          expectedVersion,
          applyToken,
          actorId,
          approvalId,
        });
        const applyingVersion = expectedVersion + 1;
        let migrationInvocationStarted = false;

        try {
          const migrationPlan = changeSet.migrationPlan;
          const applicationUniversalIdentifier =
            changeSet.applicationUniversalIdentifier;

          if (
            migrationPlan === null ||
            applicationUniversalIdentifier === null ||
            changeSet.riskClass !== context.riskClass
          ) {
            throw new Error(
              'Metadata change set is not bound to the policy decision.',
            );
          }

          migrationInvocationStarted = true;
          const migrationResult =
            await withDestructiveMetadataChangeExecutionContext(
              { source: 'CHANGE_SET', workspaceId, changeSetId: id },
              () =>
                this.workspaceMigrationService.validateBuildAndRunWorkspaceMigrationFromRecord(
                  {
                    workspaceId,
                    allFlatEntityOperationRecordByMetadataName: migrationPlan,
                    applicationUniversalIdentifier,
                    isSystemBuild: false,
                    destructiveChangeAuthorization: {
                      source: 'CHANGE_SET',
                      workspaceId,
                      changeSetId: id,
                    },
                  },
                ),
            );

          if (migrationResult.status === 'fail') {
            migrationInvocationStarted = false;
            throw new Error('Metadata change-set apply failed validation.');
          }

          let appliedMetadataVersion =
            await this.getMetadataVersion(workspaceId);

          if (appliedMetadataVersion === changeSet.baseMetadataVersion) {
            await this.workspaceMetadataVersionService.incrementMetadataVersion(
              workspaceId,
            );
            appliedMetadataVersion = await this.getMetadataVersion(workspaceId);
          }

          await this.configurationVersionService.createWithOutbox({
            id: randomUUID(),
            workspaceId,
            metadataVersion: appliedMetadataVersion,
            platformVersion: TWENTY_CURRENT_VERSION,
            changeSetId: id,
            snapshot:
              await this.configurationSnapshotService.build(workspaceId),
            rootCorrelationId: context.correlation.rootCorrelationId,
          });
          await this.changeSetService.markApplied({
            workspaceId,
            id,
            expectedVersion: applyingVersion,
            appliedMetadataVersion,
          });
          terminalState = 'APPLIED';

          return { appliedMetadataVersion };
        } catch (error) {
          if (migrationInvocationStarted) {
            await this.changeSetService.markApplyReconciliationRequired({
              workspaceId,
              id,
              expectedVersion: applyingVersion,
              failureCode: 'APPLY_OUTCOME_UNCERTAIN',
            });
            terminalState = 'ROLLBACK_PENDING';
          } else {
            await this.changeSetService.markFailed({
              workspaceId,
              id,
              expectedVersion: applyingVersion,
              failureCode: 'APPLY_FAILED',
            });
            terminalState = 'FAILED';
          }
          throw error;
        }
      },
    });

    if (result.status === 'RECONCILIATION_REQUIRED') {
      if (terminalState === undefined) {
        throw new Error(
          'Metadata change-set reconciliation has no durable terminal state.',
        );
      }

      if (terminalState !== 'ROLLBACK_PENDING') {
        await this.changeSetService.markReconciliationRequired({
          workspaceId,
          id,
          expectedVersion: expectedVersion + 2,
          from: terminalState,
          failureCode: 'AUDIT_OUTCOME_UNAVAILABLE',
        });
      }
    }

    return result;
  }

  async rollback({
    workspaceId,
    id,
    expectedVersion,
    from,
    rollbackToken,
    approvalId,
    context,
    decision,
  }: Readonly<{
    workspaceId: string;
    id: string;
    expectedVersion: number;
    from: 'APPLIED' | 'FAILED';
    rollbackToken: string;
    approvalId: string;
    context: PolicyContext;
    decision: PolicyDecision;
  }>) {
    this.assertPolicyBinding({
      workspaceId,
      id,
      context,
      operation: 'metadata.changeSet.rollback',
    });
    const actorId = this.getHumanActorId(context);

    let terminalState: 'ROLLED_BACK' | 'ROLLBACK_PENDING' | undefined;
    const result = await this.protectedOperationService.execute({
      context,
      decision,
      auditMetadata: {
        targetCount: 1,
        argumentDigest: buildDeterministicDigest({ id, expectedVersion, from }),
        payloadClassification: 'CONTROL',
        approvalId,
      },
      execute: async () => {
        const changeSet = await this.changeSetService.beginRollback({
          workspaceId,
          id,
          from,
          expectedVersion,
          rollbackToken,
          actorId,
          approvalId,
        });
        const rollbackPendingVersion = expectedVersion + 1;

        try {
          const rollbackPlan = changeSet.rollbackPlan;
          const applicationUniversalIdentifier =
            changeSet.applicationUniversalIdentifier;

          if (
            rollbackPlan === null ||
            applicationUniversalIdentifier === null ||
            changeSet.riskClass !== context.riskClass
          ) {
            throw new Error(
              'Metadata rollback is not bound to the policy decision.',
            );
          }

          const migrationResult =
            await withDestructiveMetadataChangeExecutionContext(
              { source: 'CHANGE_SET', workspaceId, changeSetId: id },
              () =>
                this.workspaceMigrationService.validateBuildAndRunWorkspaceMigrationFromRecord(
                  {
                    workspaceId,
                    allFlatEntityOperationRecordByMetadataName: rollbackPlan,
                    applicationUniversalIdentifier,
                    isSystemBuild: false,
                    destructiveChangeAuthorization: {
                      source: 'CHANGE_SET',
                      workspaceId,
                      changeSetId: id,
                    },
                  },
                ),
            );

          if (migrationResult.status === 'fail') {
            throw new Error('Metadata rollback failed validation.');
          }

          let recoveredMetadataVersion =
            await this.getMetadataVersion(workspaceId);

          if (
            recoveredMetadataVersion === changeSet.appliedMetadataVersion ||
            recoveredMetadataVersion === changeSet.baseMetadataVersion
          ) {
            await this.workspaceMetadataVersionService.incrementMetadataVersion(
              workspaceId,
            );
            recoveredMetadataVersion =
              await this.getMetadataVersion(workspaceId);
          }

          await this.configurationVersionService.createWithOutbox({
            id: randomUUID(),
            workspaceId,
            metadataVersion: recoveredMetadataVersion,
            platformVersion: TWENTY_CURRENT_VERSION,
            changeSetId: id,
            snapshot:
              await this.configurationSnapshotService.build(workspaceId),
            rootCorrelationId: context.correlation.rootCorrelationId,
          });
          await this.changeSetService.markRolledBack({
            workspaceId,
            id,
            expectedVersion: rollbackPendingVersion,
            appliedMetadataVersion: recoveredMetadataVersion,
          });
          terminalState = 'ROLLED_BACK';

          return { appliedMetadataVersion: recoveredMetadataVersion };
        } catch (error) {
          await this.changeSetService.markRollbackFailed({
            workspaceId,
            id,
            expectedVersion: rollbackPendingVersion,
            failureCode: 'ROLLBACK_FAILED',
          });
          terminalState = 'ROLLBACK_PENDING';
          throw error;
        }
      },
    });

    if (result.status === 'RECONCILIATION_REQUIRED') {
      if (terminalState === undefined) {
        throw new Error(
          'Metadata rollback reconciliation has no durable terminal state.',
        );
      }

      await this.changeSetService.markRollbackReconciliationRequired({
        workspaceId,
        id,
        expectedVersion: expectedVersion + 2,
        from: terminalState,
        failureCode: 'AUDIT_OUTCOME_UNAVAILABLE',
      });
    }

    return result;
  }

  private assertPolicyBinding({
    workspaceId,
    id,
    context,
    operation = 'metadata.changeSet.apply',
  }: {
    workspaceId: string;
    id: string;
    context: PolicyContext;
    operation?: 'metadata.changeSet.apply' | 'metadata.changeSet.rollback';
  }): void {
    if (
      context.workspaceId !== workspaceId ||
      context.target.workspaceId !== workspaceId ||
      context.target.resourceType !== 'metadataChangeSet' ||
      context.target.resourceId !== id ||
      context.operation !== operation ||
      (context.riskClass !== 'R1' &&
        context.riskClass !== 'R2' &&
        context.riskClass !== 'R3')
    ) {
      throw new Error('Metadata change-set policy context is not bound.');
    }
  }

  private async getMetadataVersion(workspaceId: string): Promise<number> {
    const workspace = await this.workspaceRepository.findOne({
      select: ['metadataVersion'],
      where: { id: workspaceId },
      withDeleted: true,
    });

    if (!isDefined(workspace?.metadataVersion)) {
      throw new Error('Metadata version is unavailable after apply.');
    }

    return workspace.metadataVersion;
  }

  private getHumanActorId(context: PolicyContext): string {
    if (context.actor.type !== 'user') {
      throw new Error(
        'Metadata change-set execution requires a human policy actor.',
      );
    }

    return context.actor.id;
  }
}
