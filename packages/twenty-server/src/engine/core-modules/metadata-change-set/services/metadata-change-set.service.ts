import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isDefined } from 'twenty-shared/utils';
import { Repository } from 'typeorm';
import { type QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

import {
  MetadataChangeSetEntity,
  type MetadataChangeOperation,
  type MetadataChangeSetRecoveryStrategy,
  type MetadataDependencyImpact,
} from 'src/engine/core-modules/metadata-change-set/entities/metadata-change-set.entity';
import { MetadataDependencyAnalyzerService } from 'src/engine/core-modules/metadata-change-set/services/metadata-dependency-analyzer.service';
import { type MetadataChangeSetState } from 'src/engine/core-modules/metadata-change-set/types/metadata-change-set-state.type';
import { buildDeterministicDigest } from 'src/engine/core-modules/policy/utils/build-deterministic-digest.util';
import { assertMetadataChangeSetTransition } from 'src/engine/core-modules/metadata-change-set/utils/assert-metadata-change-set-transition.util';
import { buildMetadataChangeOperations } from 'src/engine/core-modules/metadata-change-set/utils/build-metadata-change-operations.util';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type AllFlatEntityOperationRecordByMetadataName } from 'src/engine/metadata-modules/flat-entity/types/all-flat-entity-operation-record-by-metadata-name.type';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';

const SHA_256_PATTERN = /^[a-f0-9]{64}$/;
const METADATA_APPROVAL_LIFETIME_IN_MILLISECONDS = 15 * 60 * 1000;

@Injectable()
export class MetadataChangeSetService {
  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    @InjectWorkspaceScopedRepository(MetadataChangeSetEntity)
    private readonly changeSetRepository: WorkspaceScopedRepository<MetadataChangeSetEntity>,
    private readonly dependencyAnalyzer: MetadataDependencyAnalyzerService,
    private readonly workspaceMigrationService: WorkspaceMigrationValidateBuildAndRunService,
  ) {}

  async createDraft({
    id,
    workspaceId,
    baseMetadataVersion,
    createdByActorId,
    operations,
    migrationPlan,
    applicationUniversalIdentifier,
    rollbackPlan,
    recoveryStrategy,
    dependencyResolutionDigest,
  }: Readonly<{
    id: string;
    workspaceId: string;
    baseMetadataVersion: number;
    createdByActorId: string;
    operations: readonly MetadataChangeOperation[];
    migrationPlan?: AllFlatEntityOperationRecordByMetadataName;
    applicationUniversalIdentifier?: string;
    rollbackPlan?: AllFlatEntityOperationRecordByMetadataName;
    recoveryStrategy?: MetadataChangeSetRecoveryStrategy;
    dependencyResolutionDigest?: string;
  }>): Promise<MetadataChangeSetEntity> {
    const resolvedOperations = isDefined(migrationPlan)
      ? buildMetadataChangeOperations(migrationPlan)
      : [...operations];

    this.assertValidOperations(resolvedOperations);

    if (
      isDefined(dependencyResolutionDigest) &&
      !this.isSha256(dependencyResolutionDigest)
    ) {
      throw new Error('Metadata dependency resolution digest is invalid.');
    }

    const workspace = await this.workspaceRepository.findOne({
      select: ['id', 'metadataVersion'],
      where: { id: workspaceId },
      withDeleted: true,
    });

    if (workspace?.metadataVersion !== baseMetadataVersion) {
      throw new Error('Metadata base version is stale.');
    }

    const entityInput = {
      id,
      state: 'DRAFT',
      baseMetadataVersion,
      operations: resolvedOperations,
      migrationPlan: migrationPlan ?? null,
      applicationUniversalIdentifier: applicationUniversalIdentifier ?? null,
      rollbackPlan: rollbackPlan ?? null,
      recoveryStrategy: recoveryStrategy ?? null,
      dependencyResolutionDigest: dependencyResolutionDigest ?? null,
      applyTokenDigest: null,
      approvalId: null,
      approvalAction: null,
      approvalActionDigest: null,
      approvalExpiresAt: null,
      riskClass: null,
      compatibilityFindings: [],
      appliedMetadataVersion: null,
      dependencyImpact: {
        workflows: [],
        views: [],
        applications: [],
        contracts: [],
        metadata: [],
      },
      createdByActorId,
      approvedByActorId: null,
      failureCode: null,
      version: 1,
    } as QueryDeepPartialEntity<MetadataChangeSetEntity>;

    return this.changeSetRepository.insertAndReturnOne(
      workspaceId,
      entityInput,
    );
  }

  async findOneOrThrow(
    workspaceId: string,
    id: string,
  ): Promise<MetadataChangeSetEntity> {
    const changeSet = await this.changeSetRepository.findOne(workspaceId, {
      where: { id },
    });

    if (changeSet === null) {
      throw new Error('Metadata change set was not found.');
    }

    return changeSet;
  }

  async list({
    workspaceId,
    limit,
  }: Readonly<{
    workspaceId: string;
    limit: number;
  }>): Promise<MetadataChangeSetEntity[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error('Metadata change-set list limit is invalid.');
    }

    return this.changeSetRepository.find(workspaceId, {
      order: { updatedAt: 'DESC' },
      take: limit,
    });
  }

  async plan({
    workspaceId,
    id,
    expectedVersion,
  }: Readonly<{
    workspaceId: string;
    id: string;
    expectedVersion: number;
  }>): Promise<MetadataDependencyImpact> {
    const changeSet = await this.changeSetRepository.findOne(workspaceId, {
      where: { id, state: 'DRAFT', version: expectedVersion },
    });

    if (changeSet === null) {
      throw new Error('Metadata change set is stale or is not a draft.');
    }

    const workspace = await this.workspaceRepository.findOne({
      select: ['metadataVersion'],
      where: { id: workspaceId },
      withDeleted: true,
    });

    if (workspace?.metadataVersion !== changeSet.baseMetadataVersion) {
      throw new Error('Metadata base version is stale.');
    }

    if (
      !isDefined(changeSet.migrationPlan) ||
      !isDefined(changeSet.applicationUniversalIdentifier)
    ) {
      throw new Error('Legacy metadata change set has no executable plan.');
    }

    const dryRunResult =
      await this.workspaceMigrationService.validateBuildAndRunWorkspaceMigrationFromRecord(
        {
          workspaceId,
          allFlatEntityOperationRecordByMetadataName: changeSet.migrationPlan,
          applicationUniversalIdentifier:
            changeSet.applicationUniversalIdentifier,
          isSystemBuild: false,
          dryRun: true,
        },
      );

    if (dryRunResult.status === 'fail') {
      throw new Error('Metadata change-set migration plan failed validation.');
    }

    const dependencyImpact = await this.dependencyAnalyzer.analyze({
      workspaceId,
      operations: changeSet.operations,
    });
    const result = await this.changeSetRepository.update(
      workspaceId,
      { id, state: 'DRAFT', version: expectedVersion },
      {
        state: 'PLANNED',
        dependencyImpact,
        version: () => '"version" + 1',
      },
    );

    if (result.affected !== 1) {
      throw new Error('Metadata change set was changed while it was planned.');
    }

    return dependencyImpact;
  }

  async transition({
    workspaceId,
    id,
    from,
    to,
    expectedVersion,
  }: Readonly<{
    workspaceId: string;
    id: string;
    from: MetadataChangeSetState;
    to: MetadataChangeSetState;
    expectedVersion: number;
  }>): Promise<void> {
    assertMetadataChangeSetTransition(from, to);

    const result = await this.changeSetRepository.update(
      workspaceId,
      { id, state: from, version: expectedVersion },
      { state: to, version: () => '"version" + 1' },
    );

    if (result.affected !== 1) {
      throw new Error('Metadata change set is stale or changed concurrently.');
    }
  }

  async approve({
    workspaceId,
    id,
    approverActorId,
    expectedVersion,
    applyToken,
  }: Readonly<{
    workspaceId: string;
    id: string;
    approverActorId: string;
    expectedVersion: number;
    applyToken: string;
  }>): Promise<void> {
    const changeSet = await this.changeSetRepository.findOne(workspaceId, {
      where: { id, state: 'VALIDATED', version: expectedVersion },
    });

    if (
      changeSet === null ||
      !this.matchesApplyToken(changeSet.applyTokenDigest, applyToken)
    ) {
      throw new Error('Metadata change-set approval token is invalid.');
    }

    const approvalId = randomUUID();
    const approvalExpiresAt = new Date(
      Date.now() + METADATA_APPROVAL_LIFETIME_IN_MILLISECONDS,
    );
    const approvalAction = 'metadata.changeSet.apply';
    const approvalActionDigest = this.buildApprovalActionDigest({
      workspaceId,
      changeSet,
      actorId: approverActorId,
      action: approvalAction,
    });

    const result = await this.changeSetRepository.update(
      workspaceId,
      { id, state: 'VALIDATED', version: expectedVersion },
      {
        state: 'APPROVED',
        approvedByActorId: approverActorId,
        approvalId,
        approvalAction,
        approvalActionDigest,
        approvalExpiresAt,
        version: () => '"version" + 1',
      },
    );

    if (result.affected !== 1) {
      throw new Error(
        'Metadata change set approval is stale or changed concurrently.',
      );
    }
  }

  async acknowledgeDependencies({
    workspaceId,
    id,
    expectedVersion,
  }: Readonly<{
    workspaceId: string;
    id: string;
    expectedVersion: number;
  }>): Promise<{
    dependencyResolutionDigest: string;
    version: number;
  }> {
    const changeSet = await this.changeSetRepository.findOne(workspaceId, {
      where: { id, state: 'PLANNED', version: expectedVersion },
    });

    if (changeSet === null) {
      throw new Error('Metadata change set is stale or is not planned.');
    }

    if (!this.hasDependencies(changeSet.dependencyImpact)) {
      throw new Error(
        'Metadata change set has no active dependencies to acknowledge.',
      );
    }

    const dependencyResolutionDigest = this.digestDependencyResolution({
      operations: changeSet.operations,
      dependencyImpact: changeSet.dependencyImpact,
    });
    const result = await this.changeSetRepository.update(
      workspaceId,
      { id, state: 'PLANNED', version: expectedVersion },
      {
        dependencyResolutionDigest,
        version: () => '"version" + 1',
      },
    );

    if (result.affected !== 1) {
      throw new Error(
        'Metadata dependency acknowledgement is stale or changed concurrently.',
      );
    }

    return {
      dependencyResolutionDigest,
      version: expectedVersion + 1,
    };
  }

  async beginApply({
    workspaceId,
    id,
    expectedVersion,
    applyToken,
    actorId,
    approvalId,
  }: Readonly<{
    workspaceId: string;
    id: string;
    expectedVersion: number;
    applyToken: string;
    actorId: string;
    approvalId: string;
  }>): Promise<MetadataChangeSetEntity> {
    const changeSet = await this.validateApplyApproval({
      workspaceId,
      id,
      expectedVersion,
      applyToken,
      actorId,
      approvalId,
    });

    const workspace = await this.workspaceRepository.findOne({
      select: ['metadataVersion'],
      where: { id: workspaceId },
      withDeleted: true,
    });

    if (workspace?.metadataVersion !== changeSet.baseMetadataVersion) {
      throw new Error('Metadata base version is stale.');
    }

    const result = await this.changeSetRepository.update(
      workspaceId,
      { id, state: 'APPROVED', version: expectedVersion },
      { state: 'APPLYING', version: () => '"version" + 1' },
    );

    if (result.affected !== 1) {
      throw new Error(
        'Metadata change set was changed before apply could begin.',
      );
    }

    return changeSet;
  }

  async validateApplyApproval({
    workspaceId,
    id,
    expectedVersion,
    applyToken,
    actorId,
    approvalId,
  }: Readonly<{
    workspaceId: string;
    id: string;
    expectedVersion: number;
    applyToken: string;
    actorId: string;
    approvalId: string;
  }>): Promise<MetadataChangeSetEntity> {
    const changeSet = await this.changeSetRepository.findOne(workspaceId, {
      where: { id, state: 'APPROVED', version: expectedVersion },
    });

    this.assertValidApproval({
      workspaceId,
      changeSet,
      actorId,
      approvalId,
      token: applyToken,
      action: 'metadata.changeSet.apply',
    });

    return changeSet as MetadataChangeSetEntity;
  }

  async approveRollback({
    workspaceId,
    id,
    from,
    expectedVersion,
    approverActorId,
  }: Readonly<{
    workspaceId: string;
    id: string;
    from: 'APPLIED' | 'FAILED';
    expectedVersion: number;
    approverActorId: string;
  }>): Promise<{
    approvalId: string;
    rollbackToken: string;
    expiresAt: string;
    version: number;
  }> {
    const changeSet = await this.changeSetRepository.findOne(workspaceId, {
      where: { id, state: from, version: expectedVersion },
    });

    if (
      changeSet === null ||
      changeSet.recoveryStrategy !== 'ROLLBACK' ||
      !this.hasMigrationOperations(changeSet.rollbackPlan)
    ) {
      throw new Error('Metadata change set has no executable rollback plan.');
    }

    const approvalId = randomUUID();
    const rollbackToken = randomBytes(32).toString('hex');
    const approvalExpiresAt = new Date(
      Date.now() + METADATA_APPROVAL_LIFETIME_IN_MILLISECONDS,
    );
    const approvalAction = 'metadata.changeSet.rollback';
    const approvalActionDigest = this.buildApprovalActionDigest({
      workspaceId,
      changeSet,
      actorId: approverActorId,
      action: approvalAction,
      from,
    });
    const result = await this.changeSetRepository.update(
      workspaceId,
      { id, state: from, version: expectedVersion },
      {
        approvedByActorId: approverActorId,
        applyTokenDigest: this.digestApplyToken(rollbackToken),
        approvalId,
        approvalAction,
        approvalActionDigest,
        approvalExpiresAt,
        version: () => '"version" + 1',
      },
    );

    if (result.affected !== 1) {
      throw new Error(
        'Metadata rollback approval is stale or changed concurrently.',
      );
    }

    return {
      approvalId,
      rollbackToken,
      expiresAt: approvalExpiresAt.toISOString(),
      version: expectedVersion + 1,
    };
  }

  async validate({
    workspaceId,
    id,
    expectedVersion,
  }: Readonly<{
    workspaceId: string;
    id: string;
    expectedVersion: number;
  }>): Promise<{
    applyToken: string;
    compatibilityFindings: string[];
    riskClass: 'R1' | 'R2' | 'R3';
  }> {
    const changeSet = await this.changeSetRepository.findOne(workspaceId, {
      where: { id, state: 'PLANNED', version: expectedVersion },
    });

    if (changeSet === null) {
      throw new Error('Metadata change set is stale or is not planned.');
    }

    const workspace = await this.workspaceRepository.findOne({
      select: ['metadataVersion'],
      where: { id: workspaceId },
      withDeleted: true,
    });

    if (workspace?.metadataVersion !== changeSet.baseMetadataVersion) {
      throw new Error('Metadata base version is stale.');
    }

    const riskClass = this.resolveRiskClass(changeSet.operations);
    const hasDependencies = this.hasDependencies(changeSet.dependencyImpact);

    if (
      riskClass === 'R3' &&
      (changeSet.recoveryStrategy === null ||
        (changeSet.recoveryStrategy === 'ROLLBACK' &&
          !this.hasMigrationOperations(changeSet.rollbackPlan)) ||
        (changeSet.recoveryStrategy === 'FORWARD_FIX' &&
          !this.isSha256(changeSet.dependencyResolutionDigest)))
    ) {
      throw new Error(
        'Destructive metadata changes require an explicit executable recovery strategy.',
      );
    }

    if (
      riskClass === 'R3' &&
      hasDependencies &&
      !this.isSha256(changeSet.dependencyResolutionDigest)
    ) {
      throw new Error(
        'Active metadata dependencies require a coordinated resolution plan.',
      );
    }

    const compatibilityFindings = [
      ...(riskClass === 'R3' ? ['BREAKING_CHANGE'] : []),
      ...(hasDependencies ? ['ACTIVE_DEPENDENCIES'] : []),
    ];
    const applyToken = randomBytes(32).toString('hex');
    const applyTokenDigest = this.digestApplyToken(applyToken);
    const result = await this.changeSetRepository.update(
      workspaceId,
      { id, state: 'PLANNED', version: expectedVersion },
      {
        state: 'VALIDATED',
        riskClass,
        compatibilityFindings,
        applyTokenDigest,
        version: () => '"version" + 1',
      },
    );

    if (result.affected !== 1) {
      throw new Error(
        'Metadata change set was changed while it was validated.',
      );
    }

    return { applyToken, compatibilityFindings, riskClass };
  }

  async markApplied({
    workspaceId,
    id,
    expectedVersion,
    appliedMetadataVersion,
  }: Readonly<{
    workspaceId: string;
    id: string;
    expectedVersion: number;
    appliedMetadataVersion: number;
  }>): Promise<void> {
    const result = await this.changeSetRepository.update(
      workspaceId,
      { id, state: 'APPLYING', version: expectedVersion },
      {
        state: 'APPLIED',
        appliedMetadataVersion,
        applyTokenDigest: null,
        approvalId: null,
        approvalAction: null,
        approvalActionDigest: null,
        approvalExpiresAt: null,
        version: () => '"version" + 1',
      },
    );

    if (result.affected !== 1) {
      throw new Error('Metadata change set apply completion is stale.');
    }
  }

  async markFailed({
    workspaceId,
    id,
    expectedVersion,
    failureCode,
  }: Readonly<{
    workspaceId: string;
    id: string;
    expectedVersion: number;
    failureCode: string;
  }>): Promise<void> {
    const result = await this.changeSetRepository.update(
      workspaceId,
      { id, state: 'APPLYING', version: expectedVersion },
      {
        state: 'FAILED',
        failureCode,
        applyTokenDigest: null,
        approvalId: null,
        approvalAction: null,
        approvalActionDigest: null,
        approvalExpiresAt: null,
        version: () => '"version" + 1',
      },
    );

    if (result.affected !== 1) {
      throw new Error('Metadata change set failure state is stale.');
    }
  }

  async markReconciliationRequired({
    workspaceId,
    id,
    expectedVersion,
    from,
    failureCode,
  }: Readonly<{
    workspaceId: string;
    id: string;
    expectedVersion: number;
    from: 'APPLIED' | 'FAILED';
    failureCode: string;
  }>): Promise<void> {
    const result = await this.changeSetRepository.update(
      workspaceId,
      { id, state: from, version: expectedVersion },
      {
        state: 'ROLLBACK_PENDING',
        failureCode,
        version: () => '"version" + 1',
      },
    );

    if (result.affected !== 1) {
      throw new Error('Metadata reconciliation state is stale.');
    }
  }

  async markApplyReconciliationRequired({
    workspaceId,
    id,
    expectedVersion,
    failureCode,
  }: Readonly<{
    workspaceId: string;
    id: string;
    expectedVersion: number;
    failureCode: string;
  }>): Promise<void> {
    const result = await this.changeSetRepository.update(
      workspaceId,
      { id, state: 'APPLYING', version: expectedVersion },
      {
        state: 'ROLLBACK_PENDING',
        failureCode,
        applyTokenDigest: null,
        approvalId: null,
        approvalAction: null,
        approvalActionDigest: null,
        approvalExpiresAt: null,
        version: () => '"version" + 1',
      },
    );

    if (result.affected !== 1) {
      throw new Error('Metadata apply reconciliation state is stale.');
    }
  }

  async beginRollback({
    workspaceId,
    id,
    from,
    expectedVersion,
    rollbackToken,
    actorId,
    approvalId,
  }: Readonly<{
    workspaceId: string;
    id: string;
    from: 'APPLIED' | 'FAILED';
    expectedVersion: number;
    rollbackToken: string;
    actorId: string;
    approvalId: string;
  }>): Promise<MetadataChangeSetEntity> {
    const changeSet = await this.validateRollbackApproval({
      workspaceId,
      id,
      from,
      expectedVersion,
      rollbackToken,
      actorId,
      approvalId,
    });

    const result = await this.changeSetRepository.update(
      workspaceId,
      { id, state: from, version: expectedVersion },
      {
        state: 'ROLLBACK_PENDING',
        failureCode: null,
        version: () => '"version" + 1',
      },
    );

    if (result.affected !== 1) {
      throw new Error('Metadata rollback start is stale.');
    }

    return changeSet;
  }

  async validateRollbackApproval({
    workspaceId,
    id,
    from,
    expectedVersion,
    rollbackToken,
    actorId,
    approvalId,
  }: Readonly<{
    workspaceId: string;
    id: string;
    from: 'APPLIED' | 'FAILED';
    expectedVersion: number;
    rollbackToken: string;
    actorId: string;
    approvalId: string;
  }>): Promise<MetadataChangeSetEntity> {
    const changeSet = await this.changeSetRepository.findOne(workspaceId, {
      where: { id, state: from, version: expectedVersion },
    });

    if (
      changeSet === null ||
      changeSet.recoveryStrategy !== 'ROLLBACK' ||
      !this.hasMigrationOperations(changeSet.rollbackPlan)
    ) {
      throw new Error('Metadata change set has no executable rollback plan.');
    }

    this.assertValidApproval({
      workspaceId,
      changeSet,
      actorId,
      approvalId,
      token: rollbackToken,
      action: 'metadata.changeSet.rollback',
      from,
    });

    return changeSet;
  }

  async markRolledBack({
    workspaceId,
    id,
    expectedVersion,
    appliedMetadataVersion,
  }: Readonly<{
    workspaceId: string;
    id: string;
    expectedVersion: number;
    appliedMetadataVersion: number;
  }>): Promise<void> {
    const result = await this.changeSetRepository.update(
      workspaceId,
      { id, state: 'ROLLBACK_PENDING', version: expectedVersion },
      {
        state: 'ROLLED_BACK',
        appliedMetadataVersion,
        failureCode: null,
        applyTokenDigest: null,
        approvalId: null,
        approvalAction: null,
        approvalActionDigest: null,
        approvalExpiresAt: null,
        version: () => '"version" + 1',
      },
    );

    if (result.affected !== 1) {
      throw new Error('Metadata rollback completion is stale.');
    }
  }

  async markRollbackFailed({
    workspaceId,
    id,
    expectedVersion,
    failureCode,
  }: Readonly<{
    workspaceId: string;
    id: string;
    expectedVersion: number;
    failureCode: string;
  }>): Promise<void> {
    const result = await this.changeSetRepository.update(
      workspaceId,
      { id, state: 'ROLLBACK_PENDING', version: expectedVersion },
      {
        failureCode,
        applyTokenDigest: null,
        approvalId: null,
        approvalAction: null,
        approvalActionDigest: null,
        approvalExpiresAt: null,
        version: () => '"version" + 1',
      },
    );

    if (result.affected !== 1) {
      throw new Error('Metadata rollback failure state is stale.');
    }
  }

  async markRollbackReconciliationRequired({
    workspaceId,
    id,
    expectedVersion,
    from,
    failureCode,
  }: Readonly<{
    workspaceId: string;
    id: string;
    expectedVersion: number;
    from: 'ROLLED_BACK' | 'ROLLBACK_PENDING';
    failureCode: string;
  }>): Promise<void> {
    const result = await this.changeSetRepository.update(
      workspaceId,
      { id, state: from, version: expectedVersion },
      {
        state: 'ROLLBACK_PENDING',
        failureCode,
        version: () => '"version" + 1',
      },
    );

    if (result.affected !== 1) {
      throw new Error('Metadata rollback reconciliation state is stale.');
    }
  }

  private assertValidOperations(
    operations: readonly MetadataChangeOperation[],
  ): void {
    if (operations.length === 0) {
      throw new Error(
        'Metadata change set must contain at least one operation.',
      );
    }

    const operationKeys = new Set<string>();

    for (const operation of operations) {
      const operationKey = `${operation.metadataType}:${operation.universalIdentifier}`;

      if (
        operation.metadataType.length === 0 ||
        operation.universalIdentifier.length === 0 ||
        !SHA_256_PATTERN.test(operation.payloadDigest) ||
        operationKeys.has(operationKey)
      ) {
        throw new Error('Metadata change set contains an invalid operation.');
      }

      operationKeys.add(operationKey);
    }
  }

  private resolveRiskClass(
    operations: readonly MetadataChangeOperation[],
  ): 'R1' | 'R2' | 'R3' {
    if (operations.some(({ operation }) => operation === 'DELETE')) {
      return 'R3';
    }

    return operations.some(({ operation }) => operation === 'UPDATE')
      ? 'R2'
      : 'R1';
  }

  private hasMigrationOperations(
    migrationPlan: AllFlatEntityOperationRecordByMetadataName | null,
  ): boolean {
    if (migrationPlan === null) {
      return false;
    }

    return Object.values(migrationPlan).some(
      (operationRecord) =>
        isDefined(operationRecord) &&
        (Object.keys(operationRecord.flatEntityToCreate).length > 0 ||
          Object.keys(operationRecord.flatEntityToUpdate).length > 0 ||
          Object.keys(operationRecord.flatEntityToDelete).length > 0),
    );
  }

  private digestApplyToken(applyToken: string): string {
    return createHash('sha256').update(applyToken).digest('hex');
  }

  private digestDependencyResolution({
    operations,
    dependencyImpact,
  }: Readonly<{
    operations: readonly MetadataChangeOperation[];
    dependencyImpact: MetadataDependencyImpact;
  }>): string {
    const canonicalValue = {
      operations: [...operations].sort((left, right) =>
        `${left.metadataType}:${left.universalIdentifier}`.localeCompare(
          `${right.metadataType}:${right.universalIdentifier}`,
        ),
      ),
      dependencyImpact: Object.fromEntries(
        Object.entries(dependencyImpact)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, values]) => [key, [...values].sort()]),
      ),
    };

    return createHash('sha256')
      .update(JSON.stringify(canonicalValue))
      .digest('hex');
  }

  private hasDependencies(dependencyImpact: MetadataDependencyImpact): boolean {
    return Object.values(dependencyImpact).some(
      (dependencies) => dependencies.length > 0,
    );
  }

  private matchesApplyToken(
    expectedDigest: string | null,
    applyToken: string,
  ): boolean {
    if (!this.isSha256(expectedDigest)) {
      return false;
    }

    const actualDigest = this.digestApplyToken(applyToken);

    return timingSafeEqual(
      Buffer.from(expectedDigest, 'hex'),
      Buffer.from(actualDigest, 'hex'),
    );
  }

  private assertValidApproval({
    workspaceId,
    changeSet,
    actorId,
    approvalId,
    token,
    action,
    from,
  }: Readonly<{
    workspaceId: string;
    changeSet: MetadataChangeSetEntity | null;
    actorId: string;
    approvalId: string;
    token: string;
    action: 'metadata.changeSet.apply' | 'metadata.changeSet.rollback';
    from?: 'APPLIED' | 'FAILED';
  }>): void {
    if (
      changeSet === null ||
      changeSet.approvedByActorId !== actorId ||
      changeSet.approvalId !== approvalId ||
      changeSet.approvalAction !== action ||
      changeSet.approvalExpiresAt === null ||
      changeSet.approvalExpiresAt.getTime() <= Date.now() ||
      !this.matchesApplyToken(changeSet.applyTokenDigest, token) ||
      !this.matchesApprovalActionDigest({
        workspaceId,
        changeSet,
        actorId,
        action,
        from,
      })
    ) {
      throw new Error(
        'Metadata approval is expired or is not bound to this action.',
      );
    }
  }

  private matchesApprovalActionDigest({
    workspaceId,
    changeSet,
    actorId,
    action,
    from,
  }: Readonly<{
    workspaceId: string;
    changeSet: MetadataChangeSetEntity;
    actorId: string;
    action: 'metadata.changeSet.apply' | 'metadata.changeSet.rollback';
    from?: 'APPLIED' | 'FAILED';
  }>): boolean {
    if (!this.isSha256(changeSet.approvalActionDigest)) {
      return false;
    }

    const actualDigest = this.buildApprovalActionDigest({
      workspaceId,
      changeSet,
      actorId,
      action,
      from,
    });

    return timingSafeEqual(
      Buffer.from(changeSet.approvalActionDigest, 'hex'),
      Buffer.from(actualDigest, 'hex'),
    );
  }

  private buildApprovalActionDigest({
    workspaceId,
    changeSet,
    actorId,
    action,
    from,
  }: Readonly<{
    workspaceId: string;
    changeSet: MetadataChangeSetEntity;
    actorId: string;
    action: 'metadata.changeSet.apply' | 'metadata.changeSet.rollback';
    from?: 'APPLIED' | 'FAILED';
  }>): string {
    return buildDeterministicDigest({
      schemaVersion: 1,
      workspaceId,
      actorId,
      action,
      target: changeSet.id,
      baseMetadataVersion: changeSet.baseMetadataVersion,
      operations: changeSet.operations,
      migrationPlan: changeSet.migrationPlan,
      applicationUniversalIdentifier: changeSet.applicationUniversalIdentifier,
      rollbackPlan: changeSet.rollbackPlan,
      recoveryStrategy: changeSet.recoveryStrategy,
      dependencyResolutionDigest: changeSet.dependencyResolutionDigest,
      riskClass: changeSet.riskClass,
      ...(from === undefined ? {} : { from }),
    });
  }

  private isSha256(value: string | null): value is string {
    return isDefined(value) && SHA_256_PATTERN.test(value);
  }
}
