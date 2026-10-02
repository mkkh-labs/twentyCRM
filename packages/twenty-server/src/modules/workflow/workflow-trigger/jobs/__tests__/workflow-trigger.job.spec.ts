import { DatabaseEventAction } from 'src/engine/api/graphql/graphql-query-runner/enums/database-event-action';
import { buildDeterministicDigest } from 'src/engine/core-modules/policy/utils/build-deterministic-digest.util';
import { WorkflowVersionStatus } from 'src/modules/workflow/common/standard-objects/workflow-version.workspace-entity';
import { WorkflowTriggerJob } from 'src/modules/workflow/workflow-trigger/jobs/workflow-trigger.job';
import { buildWorkflowDatabaseEventReference } from 'src/modules/workflow/workflow-trigger/utils/build-workflow-database-event-reference.util';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const WORKFLOW_ID = '22222222-2222-4222-8222-222222222222';
const WORKFLOW_VERSION_ID = '33333333-3333-4333-8333-333333333333';
const ROOT_CORRELATION_ID = '44444444-4444-4444-8444-444444444444';
const TRIGGER_SETTINGS = {
  eventName: 'person.updated',
  fields: ['name'],
};
const PROVENANCE_SIGNATURE = {
  signatureVersion: 1 as const,
  signatureKeyId: 'a'.repeat(64),
  signature: 'b'.repeat(64),
};

const buildJob = () => {
  const applicationService = {
    findTwentyStandardApplicationOrThrow: jest.fn().mockResolvedValue({
      application: { id: 'application-id' },
      workspace: {
        id: WORKSPACE_ID,
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
        updatedAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    }),
    findApplicationRoleId: jest.fn().mockResolvedValue('role-id'),
  };
  const workflowRepository = {
    findOneBy: jest.fn().mockResolvedValue({
      id: WORKFLOW_ID,
      name: 'Qualified lead',
      lastPublishedVersionId: WORKFLOW_VERSION_ID,
    }),
  };
  const recordRepository = {
    findOneBy: jest.fn().mockResolvedValue({ id: ROOT_CORRELATION_ID }),
  };
  const workspaceOrmManager = {
    executeInWorkspaceContext: jest.fn((callback: () => unknown) => callback()),
    getRepository: jest.fn((entityName: string) =>
      entityName === 'workflow' ? workflowRepository : recordRepository,
    ),
  };
  const workflowCommonWorkspaceService = {
    getWorkflowVersionOrFail: jest.fn().mockResolvedValue({
      id: WORKFLOW_VERSION_ID,
      status: WorkflowVersionStatus.ACTIVE,
      trigger: {
        type: 'DATABASE_EVENT',
        settings: TRIGGER_SETTINGS,
      },
    }),
    getObjectMetadataInfo: jest.fn().mockResolvedValue({
      flatObjectMetadata: {
        id: '55555555-5555-4555-8555-555555555555',
      },
    }),
  };
  const workflowRunnerWorkspaceService = {
    run: jest.fn().mockResolvedValue({ workflowRunId: ROOT_CORRELATION_ID }),
  };
  const workflowEffectService = {
    reserve: jest.fn().mockResolvedValue({
      status: 'RESERVED',
      execution: { id: 'effect-id', state: 'QUEUED' },
    }),
    transition: jest.fn().mockResolvedValue(undefined),
    scheduleRetry: jest.fn().mockResolvedValue(undefined),
    markDeadLettered: jest.fn().mockResolvedValue(undefined),
  };
  const workflowTriggerProvenanceService = {
    verify: jest.fn().mockReturnValue(true),
  };
  const job = new WorkflowTriggerJob(
    applicationService as never,
    workspaceOrmManager as never,
    workflowCommonWorkspaceService as never,
    workflowRunnerWorkspaceService as never,
    workflowEffectService as never,
    workflowTriggerProvenanceService as never,
  );

  return {
    applicationService,
    job,
    workflowEffectService,
    workflowRunnerWorkspaceService,
    workflowCommonWorkspaceService,
    workflowTriggerProvenanceService,
    recordRepository,
  };
};

describe('WorkflowTriggerJob', () => {
  const jobContext = {
    jobId: 'job-id',
    jobName: WorkflowTriggerJob.name,
    retryLimit: 3,
    updateData: jest.fn(),
  };

  it('denies a cron trigger whose root correlation identity is missing', async () => {
    const { applicationService, job } = buildJob();

    await expect(
      job.handle(
        {
          triggerType: 'cron',
          workspaceId: WORKSPACE_ID,
          workflowId: WORKFLOW_ID,
          payload: {},
        } as never,
        jobContext,
      ),
    ).rejects.toThrow('correlation');
    expect(
      applicationService.findTwentyStandardApplicationOrThrow,
    ).not.toHaveBeenCalled();
  });

  it.each([
    [
      'non-empty cron payload',
      {
        triggerType: 'cron',
        workspaceId: WORKSPACE_ID,
        workflowId: WORKFLOW_ID,
        payload: { restricted: 'sentinel-secret' },
        rootCorrelationId: ROOT_CORRELATION_ID,
      },
    ],
    [
      'unknown cron field',
      {
        triggerType: 'cron',
        workspaceId: WORKSPACE_ID,
        workflowId: WORKFLOW_ID,
        payload: {},
        rootCorrelationId: ROOT_CORRELATION_ID,
        authorityBypass: true,
      },
    ],
    [
      'invalid workspace identity',
      {
        triggerType: 'cron',
        workspaceId: 'not-a-workspace-id',
        workflowId: WORKFLOW_ID,
        payload: {},
        rootCorrelationId: ROOT_CORRELATION_ID,
      },
    ],
  ])('denies a malformed %s before authority lookup', async (_, data) => {
    const { applicationService, job, workflowRunnerWorkspaceService } =
      buildJob();

    await expect(job.handle(data as never, jobContext)).rejects.toThrow(
      'payload is invalid',
    );
    expect(
      applicationService.findTwentyStandardApplicationOrThrow,
    ).not.toHaveBeenCalled();
    expect(workflowRunnerWorkspaceService.run).not.toHaveBeenCalled();
  });

  it('uses the trigger root as the workflow run and effect correlation identity', async () => {
    const { job, workflowEffectService, workflowRunnerWorkspaceService } =
      buildJob();

    await job.handle(
      {
        triggerType: 'cron',
        workspaceId: WORKSPACE_ID,
        workflowId: WORKFLOW_ID,
        payload: {},
        rootCorrelationId: ROOT_CORRELATION_ID,
      },
      jobContext,
    );

    expect(workflowEffectService.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        workflowRunId: ROOT_CORRELATION_ID,
      }),
    );
    expect(workflowRunnerWorkspaceService.run).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        workflowRunId: ROOT_CORRELATION_ID,
      }),
    );
  });

  it('preserves database-event correlation through workflow-run creation', async () => {
    const { job, workflowEffectService, workflowRunnerWorkspaceService } =
      buildJob();
    const databaseEvent = buildWorkflowDatabaseEventReference({
      workspaceId: WORKSPACE_ID,
      workflowId: WORKFLOW_ID,
      workflowVersionId: WORKFLOW_VERSION_ID,
      triggerConfigurationDigest: buildDeterministicDigest(TRIGGER_SETTINGS),
      objectMetadataId: '55555555-5555-4555-8555-555555555555',
      objectNameSingular: 'person',
      action: DatabaseEventAction.UPDATED,
      event: {
        recordId: ROOT_CORRELATION_ID,
        properties: {
          before: { name: 'Before' },
          after: { name: 'After' },
          updatedFields: ['name'],
        },
      },
      signReference: () => PROVENANCE_SIGNATURE,
    });

    await job.handle(
      {
        triggerType: 'database-event',
        workspaceId: WORKSPACE_ID,
        workflowId: WORKFLOW_ID,
        databaseEvent,
      },
      jobContext,
    );

    expect(workflowRunnerWorkspaceService.run).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowRunId: databaseEvent.rootCorrelationId,
      }),
    );
    expect(workflowEffectService.reserve).toHaveBeenCalledWith(
      expect.objectContaining({ effectKey: databaseEvent.idempotencyKey }),
    );
  });

  it('denies unauthenticated provenance before metadata or record access', async () => {
    const {
      job,
      applicationService,
      workflowCommonWorkspaceService,
      workflowTriggerProvenanceService,
      recordRepository,
    } = buildJob();
    const databaseEvent = buildWorkflowDatabaseEventReference({
      workspaceId: WORKSPACE_ID,
      workflowId: WORKFLOW_ID,
      workflowVersionId: WORKFLOW_VERSION_ID,
      triggerConfigurationDigest: buildDeterministicDigest(TRIGGER_SETTINGS),
      objectMetadataId: '55555555-5555-4555-8555-555555555555',
      objectNameSingular: 'person',
      action: DatabaseEventAction.UPDATED,
      event: {
        recordId: ROOT_CORRELATION_ID,
        properties: {
          before: { name: 'Before' },
          after: { name: 'After' },
          updatedFields: ['name'],
        },
      },
      signReference: () => PROVENANCE_SIGNATURE,
    });

    workflowTriggerProvenanceService.verify.mockReturnValue(false);

    await expect(
      job.handle(
        {
          triggerType: 'database-event',
          workspaceId: WORKSPACE_ID,
          workflowId: WORKFLOW_ID,
          databaseEvent,
        },
        jobContext,
      ),
    ).rejects.toThrow('provenance is invalid');
    expect(
      applicationService.findTwentyStandardApplicationOrThrow,
    ).not.toHaveBeenCalled();
    expect(
      workflowCommonWorkspaceService.getObjectMetadataInfo,
    ).not.toHaveBeenCalled();
    expect(recordRepository.findOneBy).not.toHaveBeenCalled();
  });

  it('denies a stale trigger configuration before record access', async () => {
    const {
      job,
      workflowCommonWorkspaceService,
      workflowRunnerWorkspaceService,
      recordRepository,
    } = buildJob();
    const databaseEvent = buildWorkflowDatabaseEventReference({
      workspaceId: WORKSPACE_ID,
      workflowId: WORKFLOW_ID,
      workflowVersionId: WORKFLOW_VERSION_ID,
      triggerConfigurationDigest: buildDeterministicDigest(TRIGGER_SETTINGS),
      objectMetadataId: '55555555-5555-4555-8555-555555555555',
      objectNameSingular: 'person',
      action: DatabaseEventAction.UPDATED,
      event: {
        recordId: ROOT_CORRELATION_ID,
        properties: {
          before: { name: 'Before' },
          after: { name: 'After' },
          updatedFields: ['name'],
        },
      },
      signReference: () => PROVENANCE_SIGNATURE,
    });

    workflowCommonWorkspaceService.getWorkflowVersionOrFail.mockResolvedValue({
      id: WORKFLOW_VERSION_ID,
      status: WorkflowVersionStatus.ACTIVE,
      trigger: {
        type: 'DATABASE_EVENT',
        settings: { ...TRIGGER_SETTINGS, fields: ['email'] },
      },
    });

    await expect(
      job.handle(
        {
          triggerType: 'database-event',
          workspaceId: WORKSPACE_ID,
          workflowId: WORKFLOW_ID,
          databaseEvent,
        },
        jobContext,
      ),
    ).rejects.toThrow('trigger binding is stale');
    expect(
      workflowCommonWorkspaceService.getObjectMetadataInfo,
    ).not.toHaveBeenCalled();
    expect(recordRepository.findOneBy).not.toHaveBeenCalled();
    expect(workflowRunnerWorkspaceService.run).not.toHaveBeenCalled();
  });

  it('schedules a bounded retry after a non-terminal runner failure', async () => {
    const { job, workflowEffectService, workflowRunnerWorkspaceService } =
      buildJob();

    workflowRunnerWorkspaceService.run.mockRejectedValue(
      new Error('runner failed'),
    );

    await expect(
      job.handle(
        {
          triggerType: 'cron',
          workspaceId: WORKSPACE_ID,
          workflowId: WORKFLOW_ID,
          payload: {},
          rootCorrelationId: ROOT_CORRELATION_ID,
        },
        jobContext,
      ),
    ).rejects.toThrow('runner failed');
    expect(workflowEffectService.scheduleRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        id: 'effect-id',
        errorCode: 'WORKFLOW_TRIGGER_FAILED',
      }),
    );
    expect(workflowEffectService.markDeadLettered).not.toHaveBeenCalled();
  });

  it('dead-letters a runner failure after the retry budget is exhausted', async () => {
    const { job, workflowEffectService, workflowRunnerWorkspaceService } =
      buildJob();

    workflowEffectService.reserve.mockResolvedValue({
      status: 'DUPLICATE',
      execution: {
        id: 'effect-id',
        state: 'RETRY_WAIT',
        attemptCount: 3,
      },
    });
    workflowRunnerWorkspaceService.run.mockRejectedValue(
      new Error('runner failed'),
    );

    await expect(
      job.handle(
        {
          triggerType: 'cron',
          workspaceId: WORKSPACE_ID,
          workflowId: WORKFLOW_ID,
          payload: {},
          rootCorrelationId: ROOT_CORRELATION_ID,
        },
        jobContext,
      ),
    ).rejects.toThrow('runner failed');
    expect(workflowEffectService.markDeadLettered).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      id: 'effect-id',
      from: 'RUNNING',
      errorCode: 'WORKFLOW_TRIGGER_FAILED',
    });
    expect(workflowEffectService.scheduleRetry).not.toHaveBeenCalled();
  });
});
