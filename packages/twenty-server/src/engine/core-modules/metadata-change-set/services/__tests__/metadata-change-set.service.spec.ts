import { MetadataChangeSetService } from 'src/engine/core-modules/metadata-change-set/services/metadata-change-set.service';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';

describe('MetadataChangeSetService', () => {
  const workspaceRepository = { findOne: jest.fn() };
  const changeSetRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    insertAndReturnOne: jest.fn(),
    update: jest.fn(),
  };
  const dependencyAnalyzer = { analyze: jest.fn() };
  const workspaceMigrationService = {
    validateBuildAndRunWorkspaceMigrationFromRecord: jest.fn(),
  };
  const MetadataChangeSetServiceWithMigration =
    MetadataChangeSetService as unknown as new (
      ...args: never[]
    ) => MetadataChangeSetService;
  const service = new MetadataChangeSetServiceWithMigration(
    workspaceRepository as never,
    changeSetRepository as never,
    dependencyAnalyzer as never,
    workspaceMigrationService as never,
  );

  const issueApplyApproval = async ({
    actorId,
    applyToken,
  }: {
    actorId: string;
    applyToken: string;
  }) => {
    const changeSet = {
      id: '22222222-2222-4222-8222-222222222222',
      workspaceId: WORKSPACE_ID,
      baseMetadataVersion: 8,
      operations: [
        {
          operation: 'UPDATE' as const,
          metadataType: 'fieldMetadata',
          universalIdentifier: 'field-universal-id',
          payloadDigest: 'a'.repeat(64),
        },
      ],
      migrationPlan: { fieldMetadata: {} },
      applicationUniversalIdentifier: 'application-universal-id',
      rollbackPlan: null,
      recoveryStrategy: null,
      dependencyResolutionDigest: null,
      riskClass: 'R2' as const,
      applyTokenDigest:
        '00ba5262c7cc49e0b185b62090e5ff698ac4f23fc39b61b68e41b375c388c87b',
    };

    changeSetRepository.findOne.mockResolvedValue(changeSet);
    changeSetRepository.update.mockResolvedValue({ affected: 1 });

    await service.approve({
      workspaceId: WORKSPACE_ID,
      id: changeSet.id,
      approverActorId: actorId,
      expectedVersion: 3,
      applyToken,
    });

    const approvalUpdate = changeSetRepository.update.mock.calls[0][2];

    jest.resetAllMocks();

    return { ...changeSet, ...approvalUpdate };
  };

  beforeEach(() => jest.resetAllMocks());

  it('dry-runs the exact migration plan before marking a draft planned', async () => {
    const migrationPlan = {
      fieldMetadata: {
        flatEntityToCreate: {},
        flatEntityToUpdate: {},
        flatEntityToDelete: {
          'field-universal-id': {
            universalIdentifier: 'field-universal-id',
          },
        },
      },
    };

    changeSetRepository.findOne.mockResolvedValue({
      baseMetadataVersion: 8,
      operations: [
        {
          operation: 'DELETE',
          metadataType: 'fieldMetadata',
          universalIdentifier: 'field-universal-id',
          payloadDigest: 'a'.repeat(64),
        },
      ],
      migrationPlan: migrationPlan as never,
      applicationUniversalIdentifier: 'application-universal-id',
    });
    workspaceRepository.findOne.mockResolvedValue({ metadataVersion: 8 });
    dependencyAnalyzer.analyze.mockResolvedValue({
      workflows: [],
      views: [],
      applications: [],
      contracts: [],
      metadata: [],
    });
    workspaceMigrationService.validateBuildAndRunWorkspaceMigrationFromRecord.mockResolvedValue(
      {
        status: 'success',
        workspaceMigration: { actions: [] },
        hasSchemaMetadataChanged: false,
      },
    );
    changeSetRepository.update.mockResolvedValue({ affected: 1 });

    await service.plan({
      workspaceId: WORKSPACE_ID,
      id: '22222222-2222-4222-8222-222222222222',
      expectedVersion: 1,
    });

    expect(
      workspaceMigrationService.validateBuildAndRunWorkspaceMigrationFromRecord,
    ).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      allFlatEntityOperationRecordByMetadataName: migrationPlan,
      applicationUniversalIdentifier: 'application-universal-id',
      isSystemBuild: false,
      dryRun: true,
    });
  });

  it('rejects a draft created against a stale metadata version', async () => {
    workspaceRepository.findOne.mockResolvedValue({ metadataVersion: 8 });

    await expect(
      service.createDraft({
        id: '22222222-2222-4222-8222-222222222222',
        workspaceId: WORKSPACE_ID,
        baseMetadataVersion: 7,
        createdByActorId: '33333333-3333-4333-8333-333333333333',
        operations: [
          {
            operation: 'UPDATE',
            metadataType: 'field',
            universalIdentifier: 'field-1',
            payloadDigest: 'a'.repeat(64),
          },
        ],
      }),
    ).rejects.toThrow('Metadata base version is stale.');
    expect(changeSetRepository.insertAndReturnOne).not.toHaveBeenCalled();
  });

  it('rejects an empty change set before querying repository state', async () => {
    await expect(
      service.createDraft({
        id: '22222222-2222-4222-8222-222222222222',
        workspaceId: WORKSPACE_ID,
        baseMetadataVersion: 7,
        createdByActorId: '33333333-3333-4333-8333-333333333333',
        operations: [],
      }),
    ).rejects.toThrow('must contain at least one operation');
    expect(workspaceRepository.findOne).not.toHaveBeenCalled();
  });

  it('persists the executable and recovery plans with the draft', async () => {
    const migrationPlan = {
      fieldMetadata: {
        flatEntityToCreate: {},
        flatEntityToUpdate: {
          'field-universal-id': {
            universalIdentifier: 'field-universal-id',
          },
        },
        flatEntityToDelete: {},
      },
    };
    const rollbackPlan = {
      fieldMetadata: {
        flatEntityToCreate: {},
        flatEntityToUpdate: {},
        flatEntityToDelete: {},
      },
    };

    workspaceRepository.findOne.mockResolvedValue({ metadataVersion: 8 });
    changeSetRepository.insertAndReturnOne.mockResolvedValue({ id: 'id' });

    await service.createDraft({
      id: '22222222-2222-4222-8222-222222222222',
      workspaceId: WORKSPACE_ID,
      baseMetadataVersion: 8,
      createdByActorId: '33333333-3333-4333-8333-333333333333',
      operations: [
        {
          operation: 'UPDATE',
          metadataType: 'fieldMetadata',
          universalIdentifier: 'field-universal-id',
          payloadDigest: 'a'.repeat(64),
        },
      ],
      migrationPlan: migrationPlan as never,
      applicationUniversalIdentifier: 'application-universal-id',
      rollbackPlan: rollbackPlan as never,
      recoveryStrategy: 'ROLLBACK',
      dependencyResolutionDigest: 'b'.repeat(64),
    });

    expect(changeSetRepository.insertAndReturnOne).toHaveBeenCalledWith(
      WORKSPACE_ID,
      expect.objectContaining({
        migrationPlan,
        rollbackPlan,
        recoveryStrategy: 'ROLLBACK',
        dependencyResolutionDigest: 'b'.repeat(64),
      }),
    );
  });

  it('uses state and version as an optimistic transition guard', async () => {
    changeSetRepository.update.mockResolvedValue({ affected: 0 });

    await expect(
      service.transition({
        workspaceId: WORKSPACE_ID,
        id: '22222222-2222-4222-8222-222222222222',
        from: 'DRAFT',
        to: 'PLANNED',
        expectedVersion: 1,
      }),
    ).rejects.toThrow('Metadata change set is stale or changed concurrently.');
  });

  it('rechecks the base version and persists dependency impact atomically', async () => {
    const dependencyImpact = {
      workflows: ['workflow-1'],
      views: [],
      applications: [],
      contracts: [],
      metadata: [],
    };

    changeSetRepository.findOne.mockResolvedValue({
      baseMetadataVersion: 8,
      operations: [],
      migrationPlan: {},
      applicationUniversalIdentifier: 'application-universal-id',
    });
    workspaceRepository.findOne.mockResolvedValue({ metadataVersion: 8 });
    dependencyAnalyzer.analyze.mockResolvedValue(dependencyImpact);
    workspaceMigrationService.validateBuildAndRunWorkspaceMigrationFromRecord.mockResolvedValue(
      {
        status: 'success',
        workspaceMigration: { actions: [] },
        hasSchemaMetadataChanged: false,
      },
    );
    changeSetRepository.update.mockResolvedValue({ affected: 1 });

    await expect(
      service.plan({
        workspaceId: WORKSPACE_ID,
        id: '22222222-2222-4222-8222-222222222222',
        expectedVersion: 1,
      }),
    ).resolves.toEqual(dependencyImpact);
    expect(changeSetRepository.update).toHaveBeenCalledWith(
      WORKSPACE_ID,
      expect.objectContaining({ state: 'DRAFT', version: 1 }),
      expect.objectContaining({
        dependencyImpact,
        state: 'PLANNED',
      }),
    );
  });

  it('binds approval identity using a compare-and-set transition', async () => {
    const applyToken = 'apply-token';

    changeSetRepository.findOne.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      workspaceId: WORKSPACE_ID,
      baseMetadataVersion: 8,
      operations: [
        {
          operation: 'UPDATE',
          metadataType: 'fieldMetadata',
          universalIdentifier: 'field-universal-id',
          payloadDigest: 'a'.repeat(64),
        },
      ],
      migrationPlan: { fieldMetadata: {} },
      applicationUniversalIdentifier: 'application-universal-id',
      rollbackPlan: null,
      recoveryStrategy: null,
      dependencyResolutionDigest: null,
      riskClass: 'R2',
      applyTokenDigest:
        '00ba5262c7cc49e0b185b62090e5ff698ac4f23fc39b61b68e41b375c388c87b',
    });
    changeSetRepository.update.mockResolvedValue({ affected: 1 });

    await service.approve({
      workspaceId: WORKSPACE_ID,
      id: '22222222-2222-4222-8222-222222222222',
      approverActorId: '33333333-3333-4333-8333-333333333333',
      expectedVersion: 3,
      applyToken,
    });

    expect(changeSetRepository.update).toHaveBeenCalledWith(
      WORKSPACE_ID,
      expect.objectContaining({ state: 'VALIDATED', version: 3 }),
      expect.objectContaining({
        approvalId: expect.any(String),
        approvalAction: 'metadata.changeSet.apply',
        approvalActionDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        approvalExpiresAt: expect.any(Date),
        approvedByActorId: '33333333-3333-4333-8333-333333333333',
        state: 'APPROVED',
      }),
    );
  });

  it('rejects an expired metadata approval before changing state', async () => {
    const applyToken = 'apply-token';

    changeSetRepository.findOne.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      workspaceId: WORKSPACE_ID,
      state: 'APPROVED',
      approvedByActorId: '33333333-3333-4333-8333-333333333333',
      approvalId: '55555555-5555-4555-8555-555555555555',
      approvalAction: 'metadata.changeSet.apply',
      approvalActionDigest: 'b'.repeat(64),
      approvalExpiresAt: new Date('2000-01-01T00:00:00.000Z'),
      baseMetadataVersion: 8,
      operations: [],
      migrationPlan: {},
      applicationUniversalIdentifier: 'application-universal-id',
      rollbackPlan: null,
      recoveryStrategy: null,
      dependencyResolutionDigest: null,
      riskClass: 'R2',
      applyTokenDigest:
        '00ba5262c7cc49e0b185b62090e5ff698ac4f23fc39b61b68e41b375c388c87b',
    });

    await expect(
      service.beginApply({
        workspaceId: WORKSPACE_ID,
        id: '22222222-2222-4222-8222-222222222222',
        expectedVersion: 4,
        applyToken,
        actorId: '33333333-3333-4333-8333-333333333333',
        approvalId: '55555555-5555-4555-8555-555555555555',
      }),
    ).rejects.toThrow('expired or is not bound');
    expect(workspaceRepository.findOne).not.toHaveBeenCalled();
    expect(changeSetRepository.update).not.toHaveBeenCalled();
  });

  it('issues a separate digest-bound approval for rollback', async () => {
    changeSetRepository.findOne.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      workspaceId: WORKSPACE_ID,
      state: 'APPLIED',
      baseMetadataVersion: 8,
      operations: [],
      migrationPlan: {},
      applicationUniversalIdentifier: 'application-universal-id',
      rollbackPlan: {
        fieldMetadata: {
          flatEntityToCreate: {},
          flatEntityToUpdate: {},
          flatEntityToDelete: {
            'field-universal-id': {
              universalIdentifier: 'field-universal-id',
            },
          },
        },
      },
      recoveryStrategy: 'ROLLBACK',
      dependencyResolutionDigest: null,
      riskClass: 'R3',
    });
    changeSetRepository.update.mockResolvedValue({ affected: 1 });

    const result = await service.approveRollback({
      workspaceId: WORKSPACE_ID,
      id: '22222222-2222-4222-8222-222222222222',
      from: 'APPLIED',
      expectedVersion: 6,
      approverActorId: '33333333-3333-4333-8333-333333333333',
    });

    expect(result).toMatchObject({
      approvalId: expect.any(String),
      rollbackToken: expect.stringMatching(/^[a-f0-9]{64}$/),
      expiresAt: expect.any(String),
      version: 7,
    });
    expect(changeSetRepository.update).toHaveBeenCalledWith(
      WORKSPACE_ID,
      {
        id: '22222222-2222-4222-8222-222222222222',
        state: 'APPLIED',
        version: 6,
      },
      expect.objectContaining({
        approvalAction: 'metadata.changeSet.rollback',
        approvalActionDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        approvalExpiresAt: expect.any(Date),
        approvedByActorId: '33333333-3333-4333-8333-333333333333',
        applyTokenDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it('rejects apply when the metadata version changed after approval', async () => {
    const applyToken = 'apply-token';
    const actorId = '33333333-3333-4333-8333-333333333333';
    const approvedChangeSet = await issueApplyApproval({ actorId, applyToken });

    changeSetRepository.findOne.mockResolvedValue(approvedChangeSet);
    workspaceRepository.findOne.mockResolvedValue({ metadataVersion: 9 });

    await expect(
      service.beginApply({
        workspaceId: WORKSPACE_ID,
        id: '22222222-2222-4222-8222-222222222222',
        expectedVersion: 4,
        applyToken,
        actorId,
        approvalId: approvedChangeSet.approvalId,
      }),
    ).rejects.toThrow('Metadata base version is stale.');
    expect(changeSetRepository.update).not.toHaveBeenCalled();
  });

  it('rejects an apply token replayed by a different actor', async () => {
    const applyToken = 'apply-token';
    const approvedChangeSet = await issueApplyApproval({
      actorId: '33333333-3333-4333-8333-333333333333',
      applyToken,
    });

    changeSetRepository.findOne.mockResolvedValue(approvedChangeSet);

    await expect(
      service.beginApply({
        workspaceId: WORKSPACE_ID,
        id: '22222222-2222-4222-8222-222222222222',
        expectedVersion: 4,
        applyToken,
        actorId: '44444444-4444-4444-8444-444444444444',
        approvalId: approvedChangeSet.approvalId,
      }),
    ).rejects.toThrow('expired or is not bound');
    expect(workspaceRepository.findOne).not.toHaveBeenCalled();
    expect(changeSetRepository.update).not.toHaveBeenCalled();
  });

  it('rejects a destructive plan without an explicit recovery strategy', async () => {
    changeSetRepository.findOne.mockResolvedValue({
      baseMetadataVersion: 8,
      operations: [
        {
          operation: 'DELETE',
          metadataType: 'fieldMetadata',
          universalIdentifier: 'field-universal-id',
          payloadDigest: 'a'.repeat(64),
        },
      ],
      dependencyImpact: {
        workflows: [],
        views: [],
        applications: [],
        contracts: [],
        metadata: [],
      },
      recoveryStrategy: null,
      rollbackPlan: null,
      dependencyResolutionDigest: null,
    });
    workspaceRepository.findOne.mockResolvedValue({ metadataVersion: 8 });

    await expect(
      service.validate({
        workspaceId: WORKSPACE_ID,
        id: '22222222-2222-4222-8222-222222222222',
        expectedVersion: 2,
      }),
    ).rejects.toThrow('Destructive metadata changes require');
    expect(changeSetRepository.update).not.toHaveBeenCalled();
  });

  it('issues a single bound apply token for a recoverable validated plan', async () => {
    changeSetRepository.findOne.mockResolvedValue({
      baseMetadataVersion: 8,
      operations: [
        {
          operation: 'DELETE',
          metadataType: 'fieldMetadata',
          universalIdentifier: 'field-universal-id',
          payloadDigest: 'a'.repeat(64),
        },
      ],
      dependencyImpact: {
        workflows: [],
        views: [],
        applications: [],
        contracts: [],
        metadata: [],
      },
      recoveryStrategy: 'ROLLBACK',
      rollbackPlan: {
        fieldMetadata: {
          flatEntityToCreate: {
            'field-universal-id': {
              universalIdentifier: 'field-universal-id',
            },
          },
          flatEntityToUpdate: {},
          flatEntityToDelete: {},
        },
      },
      dependencyResolutionDigest: null,
    });
    workspaceRepository.findOne.mockResolvedValue({ metadataVersion: 8 });
    changeSetRepository.update.mockResolvedValue({ affected: 1 });

    const result = await service.validate({
      workspaceId: WORKSPACE_ID,
      id: '22222222-2222-4222-8222-222222222222',
      expectedVersion: 2,
    });

    expect(result.applyToken).toMatch(/^[a-f0-9]{64}$/);
    expect(result).toMatchObject({ riskClass: 'R3' });
    expect(changeSetRepository.update).toHaveBeenCalledWith(
      WORKSPACE_ID,
      expect.objectContaining({ state: 'PLANNED', version: 2 }),
      expect.objectContaining({
        applyTokenDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        riskClass: 'R3',
        state: 'VALIDATED',
      }),
    );
  });

  it('binds a dependency acknowledgement to the exact planned impact', async () => {
    changeSetRepository.findOne.mockResolvedValue({
      operations: [
        {
          operation: 'DELETE',
          metadataType: 'fieldMetadata',
          universalIdentifier: 'field-universal-id',
          payloadDigest: 'a'.repeat(64),
        },
      ],
      dependencyImpact: {
        workflows: ['workflow-b', 'workflow-a'],
        views: ['view-a'],
        applications: [],
        contracts: [],
        metadata: ['metadata-a'],
      },
    });
    changeSetRepository.update.mockResolvedValue({ affected: 1 });

    const result = await service.acknowledgeDependencies({
      workspaceId: WORKSPACE_ID,
      id: '22222222-2222-4222-8222-222222222222',
      expectedVersion: 2,
    });

    expect(result).toEqual({
      dependencyResolutionDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      version: 3,
    });
    expect(changeSetRepository.update).toHaveBeenCalledWith(
      WORKSPACE_ID,
      {
        id: '22222222-2222-4222-8222-222222222222',
        state: 'PLANNED',
        version: 2,
      },
      {
        dependencyResolutionDigest: result.dependencyResolutionDigest,
        version: expect.any(Function),
      },
    );
  });

  it('rejects dependency acknowledgement when no impact exists', async () => {
    changeSetRepository.findOne.mockResolvedValue({
      operations: [],
      dependencyImpact: {
        workflows: [],
        views: [],
        applications: [],
        contracts: [],
        metadata: [],
      },
    });

    await expect(
      service.acknowledgeDependencies({
        workspaceId: WORKSPACE_ID,
        id: '22222222-2222-4222-8222-222222222222',
        expectedVersion: 2,
      }),
    ).rejects.toThrow('no active dependencies');
    expect(changeSetRepository.update).not.toHaveBeenCalled();
  });

  it('moves a failed apply into reconciliation with an exact state guard', async () => {
    changeSetRepository.update.mockResolvedValue({ affected: 1 });

    await service.markReconciliationRequired({
      workspaceId: WORKSPACE_ID,
      id: '22222222-2222-4222-8222-222222222222',
      expectedVersion: 6,
      from: 'FAILED',
      failureCode: 'AUDIT_OUTCOME_UNAVAILABLE',
    });

    expect(changeSetRepository.update).toHaveBeenCalledWith(
      WORKSPACE_ID,
      {
        id: '22222222-2222-4222-8222-222222222222',
        state: 'FAILED',
        version: 6,
      },
      expect.objectContaining({
        state: 'ROLLBACK_PENDING',
        failureCode: 'AUDIT_OUTCOME_UNAVAILABLE',
      }),
    );
  });

  it('moves a completed rollback back to reconciliation with a version guard', async () => {
    changeSetRepository.update.mockResolvedValue({ affected: 1 });

    await service.markRollbackReconciliationRequired({
      workspaceId: WORKSPACE_ID,
      id: '22222222-2222-4222-8222-222222222222',
      expectedVersion: 8,
      from: 'ROLLED_BACK',
      failureCode: 'AUDIT_OUTCOME_UNAVAILABLE',
    });

    expect(changeSetRepository.update).toHaveBeenCalledWith(
      WORKSPACE_ID,
      {
        id: '22222222-2222-4222-8222-222222222222',
        state: 'ROLLED_BACK',
        version: 8,
      },
      expect.objectContaining({
        state: 'ROLLBACK_PENDING',
        failureCode: 'AUDIT_OUTCOME_UNAVAILABLE',
      }),
    );
  });

  it('lists only workspace-scoped change sets in newest-first order', async () => {
    changeSetRepository.find.mockResolvedValue([
      { id: '22222222-2222-4222-8222-222222222222' },
    ]);

    await expect(
      service.list({ workspaceId: WORKSPACE_ID, limit: 25 }),
    ).resolves.toHaveLength(1);
    expect(changeSetRepository.find).toHaveBeenCalledWith(WORKSPACE_ID, {
      order: { updatedAt: 'DESC' },
      take: 25,
    });
  });
});
