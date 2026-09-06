import { Test, type TestingModule } from '@nestjs/testing';

import { ViewFilterOperand } from 'twenty-shared/types';

import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { type WorkspaceEventBatch } from 'src/engine/workspace-event-emitter/types/workspace-event-batch.type';
import { AutomatedTriggerType } from 'src/modules/workflow/common/standard-objects/workflow-automated-trigger.workspace-entity';
import { WorkflowCommonWorkspaceService } from 'src/modules/workflow/common/workspace-services/workflow-common.workspace-service';
import { WorkflowServiceAuthorityWorkspaceService } from 'src/modules/workflow/common/workspace-services/workflow-service-authority.workspace-service';
import { WorkflowDatabaseEventTriggerListener } from 'src/modules/workflow/workflow-trigger/automated-trigger/listeners/workflow-database-event-trigger.listener';
import { WorkflowTriggerJob } from 'src/modules/workflow/workflow-trigger/jobs/workflow-trigger.job';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const WORKFLOW_ID = '22222222-2222-4222-8222-222222222222';
const OBJECT_METADATA_ID = '33333333-3333-4333-8333-333333333333';
const RECORD_ID = '44444444-4444-4444-8444-444444444444';
const SECOND_RECORD_ID = '55555555-5555-4555-8555-555555555555';

describe('WorkflowDatabaseEventTriggerListener', () => {
  let listener: WorkflowDatabaseEventTriggerListener;
  let workspaceOrmManager: jest.Mocked<WorkspaceOrmManager>;
  let messageQueueService: jest.Mocked<MessageQueueService>;
  let workspaceCacheService: jest.Mocked<WorkspaceCacheService>;
  let workflowServiceAuthority: jest.Mocked<WorkflowServiceAuthorityWorkspaceService>;
  let recordRepository: { findOneBy: jest.Mock };

  const setTriggerMap = (
    listeners: Array<{ workflowId: string; settings: object; type?: unknown }>,
  ) => {
    workspaceCacheService.getOrRecompute.mockResolvedValue({
      workflowAutomatedTriggerMaps: {
        byWorkflowId: Object.fromEntries(
          listeners.map((listener) => [
            listener.workflowId,
            { type: AutomatedTriggerType.DATABASE_EVENT, ...listener },
          ]),
        ),
      },
    } as never);
  };

  const createMockFlatObjectMetadata = (
    overrides: Partial<FlatObjectMetadata>,
  ): FlatObjectMetadata =>
    ({
      id: OBJECT_METADATA_ID,
      workspaceId: WORKSPACE_ID,
      nameSingular: 'testObject',
      namePlural: 'testObjects',
      labelSingular: 'Test Object',
      labelPlural: 'Test Objects',
      description: 'Test object for testing',
      targetTableName: 'test_objects',
      isSystem: false,
      isActive: true,
      isRemote: false,
      isAuditLogged: true,
      isSearchable: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      icon: 'Icon123',
      universalIdentifier: OBJECT_METADATA_ID,
      fieldIds: [],
      indexMetadataIds: [],
      viewIds: [],
      applicationId: null,
      ...overrides,
    }) as FlatObjectMetadata;

  beforeEach(async () => {
    recordRepository = {
      findOneBy: jest.fn(({ id }: { id: string }) =>
        Promise.resolve({ id, field1: 'new', field2: 'new' }),
      ),
    };
    workspaceOrmManager = {
      getRepository: jest.fn().mockReturnValue(recordRepository),
      executeInWorkspaceContext: jest
        .fn()
        .mockImplementation((fn: () => any, _authContext?: any) => fn()),
    } as any;

    messageQueueService = {
      add: jest.fn(),
    } as any;

    workspaceCacheService = {
      getOrRecompute: jest.fn().mockResolvedValue({
        workflowAutomatedTriggerMaps: { byWorkflowId: {} },
      } as never),
    } as any;

    workflowServiceAuthority = {
      resolve: jest.fn().mockResolvedValue({
        authContext: {
          type: 'application',
          workspace: { id: WORKSPACE_ID },
          application: { id: 'application-id' },
        },
        rolePermissionConfig: { unionOf: ['role-id'] },
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowDatabaseEventTriggerListener,
        {
          provide: WorkspaceOrmManager,
          useValue: workspaceOrmManager,
        },
        {
          provide: MessageQueueService,
          useValue: messageQueueService,
        },
        {
          provide: WorkspaceCacheService,
          useValue: workspaceCacheService,
        },
        {
          provide: 'MESSAGE_QUEUE_workflow-queue',
          useValue: messageQueueService,
        },
        {
          provide: WorkflowCommonWorkspaceService,
          useValue: {
            getWorkflowById: jest.fn(),
            getObjectMetadataInfo: jest.fn().mockResolvedValue({
              flatObjectMetadata: createMockFlatObjectMetadata({}),
              flatObjectMetadataMaps: { byId: {}, byName: {} },
              flatFieldMetadataMaps: { byId: {}, byName: {} },
            }),
          },
        },
        {
          provide: WorkflowServiceAuthorityWorkspaceService,
          useValue: workflowServiceAuthority,
        },
      ],
    }).compile();

    listener = module.get<WorkflowDatabaseEventTriggerListener>(
      WorkflowDatabaseEventTriggerListener,
    );
  });

  describe('handleObjectRecordUpdateEvent', () => {
    const workspaceId = WORKSPACE_ID;
    const databaseEventName = 'testEvent';
    const workflowId = WORKFLOW_ID;

    const mockPayload: WorkspaceEventBatch<any> = {
      workspaceId,
      name: databaseEventName,
      objectMetadata: createMockFlatObjectMetadata({}),
      events: [
        {
          recordId: RECORD_ID,
          properties: {
            updatedFields: ['field1', 'field2'],
            before: { field1: 'old', field2: 'old' },
            after: { field1: 'new', field2: 'new' },
          },
        },
      ],
    };

    const mockEventListeners = [
      {
        type: AutomatedTriggerType.DATABASE_EVENT,
        workflowId,
        settings: {
          eventName: databaseEventName,
          fields: ['field1', 'field3'],
        },
      },
    ];

    const expectDatabaseEventReference = ({
      callIndex = 0,
      action,
      recordId,
      updatedFields,
    }: {
      callIndex?: number;
      action: string;
      recordId: string;
      updatedFields: string[];
    }) => {
      const [jobName, jobData, options] = messageQueueService.add.mock.calls[
        callIndex
      ] as unknown as [string, Record<string, any>, Record<string, any>];

      expect(jobName).toBe(WorkflowTriggerJob.name);
      expect(jobData).toMatchObject({
        triggerType: 'database-event',
        workspaceId,
        workflowId,
        databaseEvent: {
          schemaVersion: 1,
          provenance: 'WORKSPACE_DATABASE_EVENT',
          policyVersion: 'p0-v1',
          workspaceId,
          workflowId,
          objectMetadataId: OBJECT_METADATA_ID,
          objectNameSingular: 'testObject',
          action,
          recordId,
          updatedFields,
        },
      });
      expect(jobData.databaseEvent).not.toHaveProperty('properties');
      expect(options).toEqual({
        id: jobData.databaseEvent.idempotencyKey,
        retryLimit: 3,
      });
    };

    it('should trigger workflow when fields are specified and match updated fields', async () => {
      setTriggerMap(mockEventListeners);

      await listener.handleObjectRecordUpdateEvent(mockPayload);

      expectDatabaseEventReference({
        action: 'updated',
        recordId: RECORD_ID,
        updatedFields: ['field1', 'field2'],
      });
    });

    it('should trigger workflow when no fields are specified', async () => {
      setTriggerMap([
        {
          ...mockEventListeners[0],
          settings: {
            eventName: databaseEventName,
            fields: undefined,
          },
        },
      ]);

      await listener.handleObjectRecordUpdateEvent(mockPayload);

      expect(messageQueueService.add).toHaveBeenCalled();
    });

    it('should trigger workflow when fields array is empty', async () => {
      setTriggerMap([
        {
          ...mockEventListeners[0],
          settings: {
            eventName: databaseEventName,
            fields: [],
          },
        },
      ]);

      await listener.handleObjectRecordUpdateEvent(mockPayload);

      expect(messageQueueService.add).toHaveBeenCalled();
    });

    it('should not trigger workflow when fields are specified but none match updated fields', async () => {
      setTriggerMap([
        {
          ...mockEventListeners[0],
          settings: {
            eventName: databaseEventName,
            fields: ['field3', 'field4'],
          },
        },
      ]);

      await listener.handleObjectRecordUpdateEvent(mockPayload);

      expect(messageQueueService.add).not.toHaveBeenCalled();
    });

    it('rejects oversized event references before queue persistence', async () => {
      setTriggerMap([
        {
          ...mockEventListeners[0],
          settings: { eventName: databaseEventName, fields: undefined },
        },
      ]);

      await listener.handleObjectRecordUpdateEvent({
        ...mockPayload,
        events: [
          {
            ...mockPayload.events[0],
            properties: {
              ...mockPayload.events[0].properties,
              updatedFields: Array.from(
                { length: 1_001 },
                (_, index) => `field${index}`,
              ),
            },
          },
        ],
      });

      expect(messageQueueService.add).not.toHaveBeenCalled();
    });

    it('does not include event contents in missing-routing logs', async () => {
      const logger = (listener as any).logger;
      const errorSpy = jest.spyOn(logger, 'error').mockImplementation();

      await listener.handleObjectRecordUpdateEvent({
        ...mockPayload,
        workspaceId: '',
        events: [
          {
            ...mockPayload.events[0],
            properties: { after: { secret: 'SENTINEL-SECRET' } },
          },
        ],
      });

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy.mock.calls.flat().join(' ')).not.toContain(
        'SENTINEL-SECRET',
      );
      expect(messageQueueService.add).not.toHaveBeenCalled();
    });

    it('should handle create events correctly', async () => {
      const createPayload: WorkspaceEventBatch<any> = {
        ...mockPayload,
        name: 'createEvent',
        events: [
          {
            ...mockPayload.events[0],
            properties: {
              after: { field1: 'new', field2: 'new' },
            },
          },
        ],
      };

      setTriggerMap([
        {
          type: AutomatedTriggerType.DATABASE_EVENT,
          workflowId,
          settings: {
            eventName: 'createEvent',
          },
        },
      ]);

      await listener.handleObjectRecordCreateEvent(createPayload);

      expectDatabaseEventReference({
        action: 'created',
        recordId: RECORD_ID,
        updatedFields: [],
      });
    });

    it('should deny delete events without scoped snapshot authority', async () => {
      const deletePayload: WorkspaceEventBatch<any> = {
        ...mockPayload,
        name: 'deleteEvent',
        events: [
          {
            ...mockPayload.events[0],
            properties: {
              before: { field1: 'old', field2: 'old' },
            },
          },
        ],
      };

      setTriggerMap([
        {
          type: AutomatedTriggerType.DATABASE_EVENT,
          workflowId,
          settings: {
            eventName: 'deleteEvent',
          },
        },
      ]);

      await listener.handleObjectRecordDeleteEvent(deletePayload);

      expect(messageQueueService.add).not.toHaveBeenCalled();
    });

    it('should deny destroy events without scoped snapshot authority', async () => {
      const destroyPayload: WorkspaceEventBatch<any> = {
        ...mockPayload,
        name: 'destroyEvent',
        events: [
          {
            ...mockPayload.events[0],
            properties: {
              before: { field1: 'old', field2: 'old' },
            },
          },
        ],
      };

      setTriggerMap([
        {
          type: AutomatedTriggerType.DATABASE_EVENT,
          workflowId,
          settings: {
            eventName: 'destroyEvent',
          },
        },
      ]);

      await listener.handleObjectRecordDestroyEvent(destroyPayload);

      expect(messageQueueService.add).not.toHaveBeenCalled();
    });

    it('should handle multiple events in a batch', async () => {
      const batchPayload: WorkspaceEventBatch<any> = {
        ...mockPayload,
        events: [
          mockPayload.events[0],
          {
            ...mockPayload.events[0],
            recordId: SECOND_RECORD_ID,
            properties: {
              updatedFields: ['field1'],
              before: { field1: 'old' },
              after: { field1: 'new' },
            },
          },
        ],
      };

      setTriggerMap([
        {
          type: AutomatedTriggerType.DATABASE_EVENT,
          workflowId,
          settings: {
            eventName: databaseEventName,
            fields: ['field1'],
          },
        },
      ]);

      await listener.handleObjectRecordUpdateEvent(batchPayload);

      expect(messageQueueService.add).toHaveBeenCalledTimes(2);
      expectDatabaseEventReference({
        callIndex: 0,
        action: 'updated',
        recordId: RECORD_ID,
        updatedFields: ['field1', 'field2'],
      });
      expectDatabaseEventReference({
        callIndex: 1,
        action: 'updated',
        recordId: SECOND_RECORD_ID,
        updatedFields: ['field1'],
      });
    });

    it('should trigger workflow for position-only updates when no fields are specified', async () => {
      const positionOnlyPayload: WorkspaceEventBatch<any> = {
        ...mockPayload,
        events: [
          {
            ...mockPayload.events[0],
            properties: {
              updatedFields: ['position'],
              before: { position: 1 },
              after: { position: 2 },
            },
          },
        ],
      };

      setTriggerMap([
        {
          ...mockEventListeners[0],
          settings: {
            eventName: databaseEventName,
            fields: undefined,
          },
        },
      ]);

      await listener.handleObjectRecordUpdateEvent(positionOnlyPayload);

      expectDatabaseEventReference({
        action: 'updated',
        recordId: RECORD_ID,
        updatedFields: ['position'],
      });
    });

    it('should trigger workflow when position changes alongside another field', async () => {
      const positionAndFieldPayload: WorkspaceEventBatch<any> = {
        ...mockPayload,
        events: [
          {
            ...mockPayload.events[0],
            properties: {
              updatedFields: ['field1', 'position'],
              before: { field1: 'old', position: 1 },
              after: { field1: 'new', position: 2 },
            },
          },
        ],
      };

      setTriggerMap([
        {
          ...mockEventListeners[0],
          settings: {
            eventName: databaseEventName,
            fields: undefined,
          },
        },
      ]);

      await listener.handleObjectRecordUpdateEvent(positionAndFieldPayload);

      expect(messageQueueService.add).toHaveBeenCalled();
    });

    it('should not trigger workflow for position-only updates when fields are specified', async () => {
      const positionOnlyPayload: WorkspaceEventBatch<any> = {
        ...mockPayload,
        events: [
          {
            ...mockPayload.events[0],
            properties: {
              updatedFields: ['position'],
              before: { position: 1 },
              after: { position: 2 },
            },
          },
        ],
      };

      setTriggerMap([
        {
          ...mockEventListeners[0],
          settings: {
            eventName: databaseEventName,
            fields: ['field1'],
          },
        },
      ]);

      await listener.handleObjectRecordUpdateEvent(positionOnlyPayload);

      expect(messageQueueService.add).not.toHaveBeenCalled();
    });

    it('denies before record access or queueing when workflow authority is unresolved', async () => {
      setTriggerMap(mockEventListeners);
      workflowServiceAuthority.resolve.mockRejectedValue(
        new Error('Application role is unresolved'),
      );

      await listener.handleObjectRecordUpdateEvent(mockPayload);

      expect(workspaceOrmManager.getRepository).not.toHaveBeenCalled();
      expect(messageQueueService.add).not.toHaveBeenCalled();
    });

    it('denies before queueing when the scoped role cannot read the record', async () => {
      setTriggerMap(mockEventListeners);
      recordRepository.findOneBy.mockResolvedValue(undefined);

      await listener.handleObjectRecordUpdateEvent(mockPayload);

      expect(workflowServiceAuthority.resolve).toHaveBeenCalledWith(
        WORKSPACE_ID,
      );
      expect(workspaceOrmManager.getRepository).toHaveBeenCalledWith(
        'testObject',
        { unionOf: ['role-id'] },
      );
      expect(messageQueueService.add).not.toHaveBeenCalled();
    });

    it('denies a cross-workspace object binding before trigger discovery', async () => {
      await listener.handleObjectRecordUpdateEvent({
        ...mockPayload,
        objectMetadata: createMockFlatObjectMetadata({
          workspaceId: '77777777-7777-4777-8777-777777777777',
        }),
      });

      expect(workspaceCacheService.getOrRecompute).not.toHaveBeenCalled();
      expect(workflowServiceAuthority.resolve).not.toHaveBeenCalled();
      expect(messageQueueService.add).not.toHaveBeenCalled();
    });

    it('evaluates record filters against the scoped projection, not the raw event', async () => {
      setTriggerMap([
        {
          ...mockEventListeners[0],
          settings: {
            eventName: databaseEventName,
            fields: ['field1'],
            filter: {
              stepFilterGroups: [],
              stepFilters: [
                {
                  id: 'filter-1',
                  type: 'TEXT',
                  operand: ViewFilterOperand.CONTAINS,
                  value: 'raw-event-secret',
                  stepOutputKey: '{{trigger.properties.after.field1}}',
                  stepFilterGroupId: 'unused',
                },
              ],
            },
          },
        },
      ]);

      await listener.handleObjectRecordUpdateEvent({
        ...mockPayload,
        events: [
          {
            ...mockPayload.events[0],
            properties: {
              ...mockPayload.events[0].properties,
              after: { field1: 'raw-event-secret' },
            },
          },
        ],
      });

      expect(recordRepository.findOneBy).toHaveBeenCalledWith({
        id: RECORD_ID,
      });
      expect(messageQueueService.add).not.toHaveBeenCalled();
    });
  });
});
