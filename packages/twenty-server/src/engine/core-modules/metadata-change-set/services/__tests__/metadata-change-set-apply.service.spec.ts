import { MetadataChangeSetApplyService } from 'src/engine/core-modules/metadata-change-set/services/metadata-change-set-apply.service';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const CHANGE_SET_ID = '22222222-2222-4222-8222-222222222222';
const APPROVAL_ID = '55555555-5555-4555-8555-555555555555';

describe('MetadataChangeSetApplyService', () => {
  const changeSetService = {
    beginApply: jest.fn(),
    beginRollback: jest.fn(),
    markApplied: jest.fn(),
    markFailed: jest.fn(),
    markReconciliationRequired: jest.fn(),
    markApplyReconciliationRequired: jest.fn(),
    markRolledBack: jest.fn(),
    markRollbackFailed: jest.fn(),
    markRollbackReconciliationRequired: jest.fn(),
  };
  const workspaceMigrationService = {
    validateBuildAndRunWorkspaceMigrationFromRecord: jest.fn(),
  };
  const workspaceRepository = { findOne: jest.fn() };
  const workspaceMetadataVersionService = {
    incrementMetadataVersion: jest.fn(),
  };
  const configurationVersionService = { createWithOutbox: jest.fn() };
  const configurationSnapshotService = { build: jest.fn() };
  const protectedOperationService = { execute: jest.fn() };
  const service = new MetadataChangeSetApplyService(
    changeSetService as never,
    workspaceMigrationService as never,
    workspaceRepository as never,
    workspaceMetadataVersionService as never,
    configurationVersionService as never,
    configurationSnapshotService as never,
    protectedOperationService as never,
  );
  const context = {
    workspaceId: WORKSPACE_ID,
    actor: {
      type: 'user',
      id: '44444444-4444-4444-8444-444444444444',
      workspaceId: WORKSPACE_ID,
    },
    operation: 'metadata.changeSet.apply',
    riskClass: 'R3',
    target: {
      workspaceId: WORKSPACE_ID,
      resourceType: 'metadataChangeSet',
      resourceId: CHANGE_SET_ID,
    },
    correlation: {
      rootCorrelationId: '33333333-3333-4333-8333-333333333333',
    },
  };
  const decision = { id: 'decision-id', outcome: 'ALLOW' };

  beforeEach(() => {
    jest.resetAllMocks();
    changeSetService.beginApply.mockResolvedValue({
      id: CHANGE_SET_ID,
      baseMetadataVersion: 8,
      version: 4,
      riskClass: 'R3',
      applicationUniversalIdentifier: 'application-universal-id',
      migrationPlan: { fieldMetadata: {} },
      operations: [
        {
          operation: 'DELETE',
          metadataType: 'fieldMetadata',
          universalIdentifier: 'field-universal-id',
          payloadDigest: 'a'.repeat(64),
        },
      ],
    });
    workspaceMigrationService.validateBuildAndRunWorkspaceMigrationFromRecord.mockResolvedValue(
      {
        status: 'success',
        workspaceMigration: { actions: [{ type: 'delete' }] },
        hasSchemaMetadataChanged: true,
      },
    );
    workspaceRepository.findOne.mockResolvedValue({ metadataVersion: 9 });
    configurationSnapshotService.build.mockResolvedValue({
      schemaVersion: 1,
      entries: {},
    });
    protectedOperationService.execute.mockImplementation(
      async ({ execute }: { execute: () => Promise<unknown> }) => ({
        status: 'SUCCEEDED',
        value: await execute(),
        policyDecisionId: 'decision-id',
      }),
    );
  });

  it('applies the exact approved plan and records its configuration version', async () => {
    await service.apply({
      workspaceId: WORKSPACE_ID,
      id: CHANGE_SET_ID,
      expectedVersion: 4,
      applyToken: 'apply-token',
      approvalId: APPROVAL_ID,
      context: context as never,
      decision: decision as never,
    });

    expect(
      workspaceMigrationService.validateBuildAndRunWorkspaceMigrationFromRecord,
    ).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      allFlatEntityOperationRecordByMetadataName: { fieldMetadata: {} },
      applicationUniversalIdentifier: 'application-universal-id',
      isSystemBuild: false,
      destructiveChangeAuthorization: {
        source: 'CHANGE_SET',
        workspaceId: WORKSPACE_ID,
        changeSetId: CHANGE_SET_ID,
      },
    });
    expect(configurationVersionService.createWithOutbox).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        metadataVersion: 9,
        changeSetId: CHANGE_SET_ID,
        rootCorrelationId: context.correlation.rootCorrelationId,
      }),
    );
    expect(changeSetService.markApplied).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      id: CHANGE_SET_ID,
      expectedVersion: 5,
      appliedMetadataVersion: 9,
    });
  });

  it('moves an applied change to reconciliation when outcome audit persistence fails', async () => {
    protectedOperationService.execute.mockImplementation(
      async ({ execute }: { execute: () => Promise<unknown> }) => {
        await execute();

        return {
          status: 'RECONCILIATION_REQUIRED',
          policyDecisionId: 'decision-id',
        };
      },
    );

    await service.apply({
      workspaceId: WORKSPACE_ID,
      id: CHANGE_SET_ID,
      expectedVersion: 4,
      applyToken: 'apply-token',
      approvalId: APPROVAL_ID,
      context: context as never,
      decision: decision as never,
    });

    expect(changeSetService.markReconciliationRequired).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      id: CHANGE_SET_ID,
      expectedVersion: 6,
      from: 'APPLIED',
      failureCode: 'AUDIT_OUTCOME_UNAVAILABLE',
    });
  });

  it('requires reconciliation when migration outcome and audit outcome are uncertain', async () => {
    workspaceMigrationService.validateBuildAndRunWorkspaceMigrationFromRecord.mockRejectedValue(
      new Error('migration failed'),
    );
    protectedOperationService.execute.mockImplementation(
      async ({ execute }: { execute: () => Promise<unknown> }) => {
        await execute().catch(() => undefined);

        return {
          status: 'RECONCILIATION_REQUIRED',
          policyDecisionId: 'decision-id',
        };
      },
    );

    await service.apply({
      workspaceId: WORKSPACE_ID,
      id: CHANGE_SET_ID,
      expectedVersion: 4,
      applyToken: 'apply-token',
      approvalId: APPROVAL_ID,
      context: context as never,
      decision: decision as never,
    });

    expect(
      changeSetService.markApplyReconciliationRequired,
    ).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      id: CHANGE_SET_ID,
      expectedVersion: 5,
      failureCode: 'APPLY_OUTCOME_UNCERTAIN',
    });
    expect(changeSetService.markFailed).not.toHaveBeenCalled();
    expect(changeSetService.markReconciliationRequired).not.toHaveBeenCalled();
  });

  it('marks a rejected migration plan failed without claiming an uncertain effect', async () => {
    workspaceMigrationService.validateBuildAndRunWorkspaceMigrationFromRecord.mockResolvedValue(
      { status: 'fail' },
    );

    await expect(
      service.apply({
        workspaceId: WORKSPACE_ID,
        id: CHANGE_SET_ID,
        expectedVersion: 4,
        applyToken: 'apply-token',
        approvalId: APPROVAL_ID,
        context: context as never,
        decision: decision as never,
      }),
    ).rejects.toThrow('failed validation');

    expect(changeSetService.markFailed).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      id: CHANGE_SET_ID,
      expectedVersion: 5,
      failureCode: 'APPLY_FAILED',
    });
    expect(
      changeSetService.markApplyReconciliationRequired,
    ).not.toHaveBeenCalled();
  });

  it('executes an approved rollback plan and records the recovered version', async () => {
    changeSetService.beginRollback.mockResolvedValue({
      id: CHANGE_SET_ID,
      baseMetadataVersion: 8,
      appliedMetadataVersion: 9,
      version: 6,
      riskClass: 'R3',
      applicationUniversalIdentifier: 'application-universal-id',
      rollbackPlan: { fieldMetadata: {} },
      operations: [],
    });
    workspaceRepository.findOne.mockResolvedValue({ metadataVersion: 10 });

    await service.rollback({
      workspaceId: WORKSPACE_ID,
      id: CHANGE_SET_ID,
      expectedVersion: 6,
      from: 'APPLIED',
      rollbackToken: 'rollback-token',
      approvalId: APPROVAL_ID,
      context: {
        ...context,
        operation: 'metadata.changeSet.rollback',
      } as never,
      decision: decision as never,
    });

    expect(
      workspaceMigrationService.validateBuildAndRunWorkspaceMigrationFromRecord,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        allFlatEntityOperationRecordByMetadataName: { fieldMetadata: {} },
      }),
    );
    expect(changeSetService.markRolledBack).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      id: CHANGE_SET_ID,
      expectedVersion: 7,
      appliedMetadataVersion: 10,
    });
  });

  it('marks a completed rollback for reconciliation when outcome audit fails', async () => {
    changeSetService.beginRollback.mockResolvedValue({
      id: CHANGE_SET_ID,
      baseMetadataVersion: 8,
      appliedMetadataVersion: 9,
      version: 6,
      riskClass: 'R3',
      applicationUniversalIdentifier: 'application-universal-id',
      rollbackPlan: { fieldMetadata: {} },
      operations: [],
    });
    workspaceRepository.findOne.mockResolvedValue({ metadataVersion: 10 });
    protectedOperationService.execute.mockImplementation(
      async ({ execute }: { execute: () => Promise<unknown> }) => {
        await execute();

        return {
          status: 'RECONCILIATION_REQUIRED',
          policyDecisionId: 'decision-id',
        };
      },
    );

    await service.rollback({
      workspaceId: WORKSPACE_ID,
      id: CHANGE_SET_ID,
      expectedVersion: 6,
      from: 'APPLIED',
      rollbackToken: 'rollback-token',
      approvalId: APPROVAL_ID,
      context: {
        ...context,
        operation: 'metadata.changeSet.rollback',
      } as never,
      decision: decision as never,
    });

    expect(
      changeSetService.markRollbackReconciliationRequired,
    ).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      id: CHANGE_SET_ID,
      expectedVersion: 8,
      from: 'ROLLED_BACK',
      failureCode: 'AUDIT_OUTCOME_UNAVAILABLE',
    });
  });
});
