import { PolicyAuditEventEntity } from 'src/engine/core-modules/policy/entities/policy-audit-event.entity';
import {
  PolicyAuditException,
  PolicyAuditExceptionCode,
} from 'src/engine/core-modules/policy/exceptions/policy-audit.exception';
import { PolicyAuditService } from 'src/engine/core-modules/policy/services/policy-audit.service';
import { type PolicyAuditEvent } from 'src/engine/core-modules/policy/types/policy-audit-event.type';
import { type WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

const WORKSPACE_ID = '20202020-1111-4111-8111-111111111111';
const ACTOR_ID = '20202020-2222-4222-8222-222222222222';
const WORKSPACE_MEMBER_ID = '20202020-3333-4333-8333-333333333333';
const DECISION_ID = '20202020-4444-4444-8444-444444444444';
const EVENT_ID = '20202020-5555-4555-8555-555555555555';
const ROOT_CORRELATION_ID = '20202020-6666-4666-8666-666666666666';
const ATTEMPT_ID = '20202020-7777-4777-8777-777777777777';
const RECORD_ID = '20202020-8888-4888-8888-888888888888';
const FIELD_METADATA_ID = '20202020-9999-4999-8999-999999999999';
const CONTEXT_DIGEST = 'a'.repeat(64);

const buildAuditEvent = (): PolicyAuditEvent => ({
  schemaVersion: 1,
  eventId: EVENT_ID,
  eventKey: `intent:${DECISION_ID}`,
  phase: 'INTENT',
  workspaceId: WORKSPACE_ID,
  actor: {
    type: 'user',
    id: ACTOR_ID,
    workspaceId: WORKSPACE_ID,
    workspaceMemberId: WORKSPACE_MEMBER_ID,
  },
  authoritySource: 'CALLER_BOUND',
  operation: 'record.update',
  riskClass: 'R2',
  target: {
    resourceType: 'objectRecord',
    resourceId: RECORD_ID,
  },
  affectedFieldMetadataIds: [FIELD_METADATA_ID],
  policyDecisionId: DECISION_ID,
  policyOutcome: 'ALLOW',
  reasonCodes: ['AUTHORIZED'],
  contextDigest: CONTEXT_DIGEST,
  correlation: {
    rootCorrelationId: ROOT_CORRELATION_ID,
    decisionId: DECISION_ID,
    attemptId: ATTEMPT_ID,
  },
  metadata: {
    targetCount: 1,
    argumentDigest: CONTEXT_DIGEST,
  },
  occurredAt: '2026-09-01T12:00:00.000Z',
});

describe('PolicyAuditService', () => {
  let repository: jest.Mocked<
    Pick<
      WorkspaceScopedRepository<PolicyAuditEventEntity>,
      'find' | 'findOneBy' | 'insertAndReturnOne'
    >
  >;
  let service: PolicyAuditService;

  beforeEach(() => {
    repository = {
      find: jest.fn(),
      findOneBy: jest.fn(),
      insertAndReturnOne: jest.fn(),
    };
    service = new PolicyAuditService(
      repository as unknown as WorkspaceScopedRepository<PolicyAuditEventEntity>,
    );
  });

  it('appends an immutable workspace-scoped audit row', async () => {
    const event = buildAuditEvent();
    const persisted = {
      id: EVENT_ID,
      ...event,
    } as unknown as PolicyAuditEventEntity;

    repository.insertAndReturnOne.mockResolvedValue(persisted);

    await expect(service.append(event)).resolves.toBe(persisted);
    expect(repository.insertAndReturnOne).toHaveBeenCalledWith(
      WORKSPACE_ID,
      expect.objectContaining({
        id: EVENT_ID,
        workspaceId: WORKSPACE_ID,
        eventKey: event.eventKey,
        phase: 'INTENT',
        actorType: 'user',
        actorId: ACTOR_ID,
        workspaceMemberId: WORKSPACE_MEMBER_ID,
        policyDecisionId: DECISION_ID,
        contextDigest: CONTEXT_DIGEST,
      }),
    );
  });

  it('returns an identical same-workspace event after a concurrent duplicate', async () => {
    const event = buildAuditEvent();
    const persisted = {
      id: EVENT_ID,
      workspaceId: WORKSPACE_ID,
      eventKey: event.eventKey,
      phase: event.phase,
      policyDecisionId: event.policyDecisionId,
      contextDigest: event.contextDigest,
    } as PolicyAuditEventEntity;

    repository.insertAndReturnOne.mockRejectedValue({ code: '23505' });
    repository.findOneBy.mockResolvedValue(persisted);

    await expect(service.append(event)).resolves.toBe(persisted);
    expect(repository.findOneBy).toHaveBeenCalledWith(WORKSPACE_ID, {
      eventKey: event.eventKey,
    });
  });

  it('rejects a duplicate event key whose binding differs', async () => {
    const event = buildAuditEvent();

    repository.insertAndReturnOne.mockRejectedValue({ code: '23505' });
    repository.findOneBy.mockResolvedValue({
      id: EVENT_ID,
      workspaceId: WORKSPACE_ID,
      eventKey: event.eventKey,
      phase: 'OUTCOME',
      policyDecisionId: event.policyDecisionId,
      contextDigest: event.contextDigest,
    } as PolicyAuditEventEntity);

    await expect(service.append(event)).rejects.toMatchObject({
      code: PolicyAuditExceptionCode.EVENT_KEY_CONFLICT,
    });
  });

  it('rejects a cross-workspace actor before persistence', async () => {
    const event = {
      ...buildAuditEvent(),
      actor: {
        ...buildAuditEvent().actor,
        workspaceId: '20202020-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      },
    } as PolicyAuditEvent;

    await expect(service.append(event)).rejects.toBeInstanceOf(
      PolicyAuditException,
    );
    await expect(service.append(event)).rejects.toMatchObject({
      code: PolicyAuditExceptionCode.INVALID_EVENT,
    });
    expect(repository.insertAndReturnOne).not.toHaveBeenCalled();
  });

  it('rejects non-allowlisted metadata before persistence', async () => {
    const event = {
      ...buildAuditEvent(),
      metadata: { rawArguments: 'SENTINEL_SECRET=top-secret' },
    } as unknown as PolicyAuditEvent;

    await expect(service.append(event)).rejects.toMatchObject({
      code: PolicyAuditExceptionCode.SENSITIVE_METADATA_REJECTED,
    });
    expect(repository.insertAndReturnOne).not.toHaveBeenCalled();
  });

  it('propagates a primary ledger failure', async () => {
    const primaryFailure = new Error('primary ledger unavailable');

    repository.insertAndReturnOne.mockRejectedValue(primaryFailure);

    await expect(service.append(buildAuditEvent())).rejects.toBe(
      primaryFailure,
    );
  });

  it('lists recent evidence through the workspace-scoped repository', async () => {
    repository.find.mockResolvedValue([
      { id: EVENT_ID } as PolicyAuditEventEntity,
    ]);

    await expect(
      service.listRecent({ workspaceId: WORKSPACE_ID, limit: 20 }),
    ).resolves.toHaveLength(1);
    expect(repository.find).toHaveBeenCalledWith(WORKSPACE_ID, {
      order: { occurredAt: 'DESC' },
      take: 20,
    });
  });
});
