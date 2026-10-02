import { randomUUID } from 'node:crypto';

import { connectionSource } from 'src/database/typeorm/core/core.datasource';
import { PolicyAuditEventEntity } from 'src/engine/core-modules/policy/entities/policy-audit-event.entity';
import { PolicyAuditService } from 'src/engine/core-modules/policy/services/policy-audit.service';
import { type PolicyAuditEvent } from 'src/engine/core-modules/policy/types/policy-audit-event.type';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

const buildEvent = ({
  workspaceId,
  actorWorkspaceId = workspaceId,
}: {
  workspaceId: string;
  actorWorkspaceId?: string;
}): PolicyAuditEvent => {
  const policyDecisionId = randomUUID();

  return {
    schemaVersion: 1,
    eventId: randomUUID(),
    eventKey: `decision:${policyDecisionId}`,
    workspaceId,
    policyDecisionId,
    actor: {
      type: 'system',
      id: null,
      workspaceId: actorWorkspaceId,
      serviceAuthorityId: 'integration-policy-audit',
    },
    authoritySource: 'SCOPED_SERVICE_PRINCIPAL',
    operation: 'policy.integration.read',
    riskClass: 'R0',
    target: { resourceType: 'workspace', resourceId: workspaceId },
    affectedFieldMetadataIds: [],
    policyOutcome: 'ALLOW',
    contextDigest: 'a'.repeat(64),
    reasonCodes: [],
    correlation: {
      rootCorrelationId: randomUUID(),
      decisionId: policyDecisionId,
      attemptId: randomUUID(),
    },
    metadata: { payloadClassification: 'CONTROL' },
    occurredAt: new Date().toISOString(),
    phase: 'DECISION',
  };
};

describe('Policy audit workspace boundary', () => {
  it('persists and lists evidence only inside its bound workspace', async () => {
    const dataSource = connectionSource.isInitialized
      ? connectionSource
      : await connectionSource.initialize();
    const workspaceId = randomUUID();
    const otherWorkspaceId = randomUUID();
    const applicationId = randomUUID();
    const otherApplicationId = randomUUID();
    const repository = dataSource.getRepository(PolicyAuditEventEntity);
    const service = new PolicyAuditService(
      new WorkspaceScopedRepository(repository),
    );
    const event = buildEvent({ workspaceId });

    try {
      await global.testDataSource.transaction(async (manager) => {
        await manager.query(
          'INSERT INTO "core"."workspace" ("id", "subdomain", "activationStatus", "workspaceCustomApplicationId") VALUES ($1, $2, $3, $4), ($5, $6, $3, $7)',
          [
            workspaceId,
            `policy-audit-${workspaceId}`,
            'PENDING_CREATION',
            applicationId,
            otherWorkspaceId,
            `policy-audit-${otherWorkspaceId}`,
            otherApplicationId,
          ],
        );
        await manager.query(
          'INSERT INTO "core"."application" ("id", "universalIdentifier", "name", "sourcePath", "workspaceId") VALUES ($1, $1, $2, $3, $4), ($5, $5, $2, $3, $6)',
          [
            applicationId,
            'Policy Audit Test',
            '/',
            workspaceId,
            otherApplicationId,
            otherWorkspaceId,
          ],
        );
      });

      await expect(service.append(event)).resolves.toMatchObject({
        id: event.eventId,
        workspaceId,
      });
      await expect(
        service.listRecent({ workspaceId, limit: 10 }),
      ).resolves.toEqual([
        expect.objectContaining({ id: event.eventId, workspaceId }),
      ]);
      await expect(
        service.listRecent({ workspaceId: otherWorkspaceId, limit: 10 }),
      ).resolves.toEqual([]);
      await expect(
        service.append(
          buildEvent({ workspaceId, actorWorkspaceId: otherWorkspaceId }),
        ),
      ).rejects.toMatchObject({ code: 'INVALID_EVENT' });
    } finally {
      await global.testDataSource.query(
        'DELETE FROM "core"."workspace" WHERE "id" = ANY($1::uuid[])',
        [[workspaceId, otherWorkspaceId]],
      );
      if (connectionSource.isInitialized) {
        await connectionSource.destroy();
      }
    }
  });
});
