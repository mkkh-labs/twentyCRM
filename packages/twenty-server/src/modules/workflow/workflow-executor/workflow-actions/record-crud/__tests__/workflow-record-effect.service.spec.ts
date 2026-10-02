import { WorkflowRecordEffectService } from 'src/modules/workflow/workflow-executor/workflow-actions/record-crud/workflow-record-effect.service';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const WORKFLOW_RUN_ID = '22222222-2222-4222-8222-222222222222';
const OBJECT_METADATA_ID = '33333333-3333-4333-8333-333333333333';
const ROLE_ID = '44444444-4444-4444-8444-444444444444';
const FIELD_METADATA_ID = '55555555-5555-4555-8555-555555555555';

describe('WorkflowRecordEffectService', () => {
  const workspaceCacheService = { getOrRecompute: jest.fn() };
  const workflowToolEffectService = { execute: jest.fn() };
  const service = new WorkflowRecordEffectService(
    workspaceCacheService as never,
    workflowToolEffectService as never,
  );
  const executionContext = {
    roleId: ROLE_ID,
    rolePermissionConfig: { unionOf: [ROLE_ID] },
    authContext: {
      type: 'application',
      workspace: { id: WORKSPACE_ID },
      application: {
        id: '66666666-6666-4666-8666-666666666666',
      },
    },
    initiator: { source: 'WORKFLOW', name: 'Workflow' },
  };
  const runInfo = {
    workspaceId: WORKSPACE_ID,
    workflowRunId: WORKFLOW_RUN_ID,
    jobId: 'workflow-job-id',
    rootCorrelationId: '77777777-7777-4777-8777-777777777777',
  };

  beforeEach(() => jest.resetAllMocks());

  it('denies restricted fields before reserving or executing a record effect', async () => {
    workspaceCacheService.getOrRecompute.mockResolvedValue({
      rolesPermissions: {
        [ROLE_ID]: {
          [OBJECT_METADATA_ID]: {
            canReadObjectRecords: true,
            canUpdateObjectRecords: true,
            canSoftDeleteObjectRecords: true,
            canDestroyObjectRecords: false,
            restrictedFields: {
              [FIELD_METADATA_ID]: { canRead: true, canUpdate: false },
            },
            rowLevelPermissionPredicates: [],
            rowLevelPermissionPredicateGroups: [],
          },
        },
      },
    });
    const effect = jest.fn();

    await service.execute({
      operation: 'update_one',
      objectName: 'company',
      objectMetadataId: OBJECT_METADATA_ID,
      fieldMetadataIds: [FIELD_METADATA_ID],
      recordIds: ['88888888-8888-4888-8888-888888888888'],
      actionInput: { name: 'Restricted' },
      executionContext: executionContext as never,
      runInfo,
      stepId: 'step-1',
      execute: effect,
    });

    expect(workflowToolEffectService.execute).toHaveBeenCalledWith(
      expect.objectContaining({ roleAllowed: false }),
    );
  });

  it('passes current role scope and correlation to an allowed record effect', async () => {
    workspaceCacheService.getOrRecompute.mockResolvedValue({
      rolesPermissions: {
        [ROLE_ID]: {
          [OBJECT_METADATA_ID]: {
            canReadObjectRecords: true,
            canUpdateObjectRecords: true,
            canSoftDeleteObjectRecords: false,
            canDestroyObjectRecords: false,
            restrictedFields: {},
            rowLevelPermissionPredicates: [],
            rowLevelPermissionPredicateGroups: [],
          },
        },
      },
    });
    workflowToolEffectService.execute.mockResolvedValue({
      success: true,
      message: 'updated',
      result: { id: '88888888-8888-4888-8888-888888888888' },
    });

    await service.execute({
      operation: 'update_one',
      objectName: 'company',
      objectMetadataId: OBJECT_METADATA_ID,
      fieldMetadataIds: [FIELD_METADATA_ID],
      recordIds: ['88888888-8888-4888-8888-888888888888'],
      actionInput: { name: 'Allowed' },
      executionContext: executionContext as never,
      runInfo,
      stepId: 'step-1',
      execute: jest.fn(),
    });

    expect(workflowToolEffectService.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        roleAllowed: true,
        policyContext: expect.objectContaining({
          affectedFieldMetadataIds: [FIELD_METADATA_ID],
          objectMetadataId: OBJECT_METADATA_ID,
          recordIds: ['88888888-8888-4888-8888-888888888888'],
          rootCorrelationId: runInfo.rootCorrelationId,
        }),
      }),
    );
  });
});
