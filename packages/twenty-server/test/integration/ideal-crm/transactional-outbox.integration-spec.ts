import { randomUUID } from 'node:crypto';

import { connectionSource } from 'src/database/typeorm/core/core.datasource';
import { ConfigurationVersionEntity } from 'src/engine/core-modules/configuration-version/entities/configuration-version.entity';
import { ConfigurationVersionService } from 'src/engine/core-modules/configuration-version/services/configuration-version.service';
import { buildDeterministicDigest } from 'src/engine/core-modules/policy/utils/build-deterministic-digest.util';
import { OutboxEventEntity } from 'src/engine/core-modules/transactional-outbox/entities/outbox-event.entity';
import { TransactionalOutboxService } from 'src/engine/core-modules/transactional-outbox/services/transactional-outbox.service';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

describe('Transactional outbox', () => {
  it('commits the mutation and event together and rolls both back on event failure', async () => {
    const dataSource = connectionSource.isInitialized
      ? connectionSource
      : await connectionSource.initialize();
    const workspaceId = randomUUID();
    const applicationId = randomUUID();
    const eventId = randomUUID();
    const rootCorrelationId = randomUUID();
    const configurationVersionId = randomUUID();
    const workspaceTransactionEventId = randomUUID();
    const workspaceTransactionConfigurationVersionId = randomUUID();
    const rolledBackConfigurationVersionId = randomUUID();
    const serviceCreatedConfigurationVersionId = randomUUID();
    const service = new TransactionalOutboxService(dataSource);
    const event = {
      id: eventId,
      eventType: 'configuration.versioned',
      schemaVersion: 1,
      aggregateType: 'configuration',
      aggregateId: configurationVersionId,
      payload: { configurationVersionId },
      rootCorrelationId,
    };

    try {
      await global.testDataSource.transaction(async (manager) => {
        await manager.query(
          'INSERT INTO "core"."workspace" ("id", "subdomain", "activationStatus", "workspaceCustomApplicationId") VALUES ($1, $2, $3, $4)',
          [
            workspaceId,
            `ideal-crm-${workspaceId}`,
            'PENDING_CREATION',
            applicationId,
          ],
        );
        await manager.query(
          'INSERT INTO "core"."application" ("id", "universalIdentifier", "name", "sourcePath", "workspaceId") VALUES ($1, $2, $3, $4, $5)',
          [applicationId, applicationId, 'Ideal CRM Test', '/', workspaceId],
        );
      });

      await expect(
        service.execute({
          workspaceId,
          event,
          mutate: async () => 'committed',
        }),
      ).resolves.toBe('committed');

      await expect(
        dataSource.getRepository(OutboxEventEntity).findOneBy({
          id: eventId,
          workspaceId,
        }),
      ).resolves.toMatchObject({
        payloadDigest: buildDeterministicDigest(event.payload),
        state: 'PENDING',
      });

      await dataSource.transaction(async (manager) => {
        await manager.getRepository(ConfigurationVersionEntity).insert({
          id: workspaceTransactionConfigurationVersionId,
          workspaceId,
          metadataVersion: 2_000_000_001,
          platformVersion: 'workspace-transaction-test',
          changeSetId: null,
          snapshot: {},
          snapshotDigest: buildDeterministicDigest({}),
        });
        await service.insertWithinWorkspaceTransaction({
          workspaceId,
          event: {
            ...event,
            id: workspaceTransactionEventId,
            aggregateId: workspaceTransactionConfigurationVersionId,
            payload: {
              configurationVersionId:
                workspaceTransactionConfigurationVersionId,
            },
          },
          transactionScope: {
            executeRawQuery: (sql: string, parameters?: unknown[]) =>
              manager.query(sql, parameters),
          } as never,
        });
      });

      await expect(
        dataSource.getRepository(OutboxEventEntity).findOneBy({
          id: workspaceTransactionEventId,
          workspaceId,
        }),
      ).resolves.toMatchObject({
        aggregateId: workspaceTransactionConfigurationVersionId,
        state: 'PENDING',
      });

      await expect(
        dataSource.transaction(async (manager) => {
          await manager.getRepository(ConfigurationVersionEntity).insert({
            id: rolledBackConfigurationVersionId,
            workspaceId,
            metadataVersion: 2_000_000_002,
            platformVersion: 'workspace-rollback-test',
            changeSetId: null,
            snapshot: {},
            snapshotDigest: buildDeterministicDigest({}),
          });
          await service.insertWithinWorkspaceTransaction({
            workspaceId,
            event: {
              ...event,
              id: workspaceTransactionEventId,
              aggregateId: rolledBackConfigurationVersionId,
              payload: {
                configurationVersionId: rolledBackConfigurationVersionId,
              },
            },
            transactionScope: {
              executeRawQuery: (sql: string, parameters?: unknown[]) =>
                manager.query(sql, parameters),
            } as never,
          });
        }),
      ).rejects.toMatchObject({ code: '23505' });

      await expect(
        dataSource.getRepository(ConfigurationVersionEntity).findOneBy({
          id: rolledBackConfigurationVersionId,
          workspaceId,
        }),
      ).resolves.toBeNull();

      await expect(
        service.execute({
          workspaceId,
          event,
          mutate: async (manager) => {
            await manager.getRepository(ConfigurationVersionEntity).insert({
              id: configurationVersionId,
              workspaceId,
              metadataVersion: 2_000_000_000,
              platformVersion: 'integration-test',
              changeSetId: null,
              snapshot: {},
              snapshotDigest: buildDeterministicDigest({}),
            });
          },
        }),
      ).rejects.toMatchObject({ code: '23505' });

      await expect(
        dataSource
          .getRepository(ConfigurationVersionEntity)
          .findOneBy({ id: configurationVersionId, workspaceId }),
      ).resolves.toBeNull();

      const configurationVersionService = new ConfigurationVersionService(
        new WorkspaceScopedRepository(
          dataSource.getRepository(ConfigurationVersionEntity),
        ),
        service,
      );

      await expect(
        configurationVersionService.createWithOutbox({
          id: serviceCreatedConfigurationVersionId,
          workspaceId,
          metadataVersion: 2_000_000_003,
          platformVersion: 'config-service-integration',
          snapshot: { schemaVersion: 1, entries: {} },
          rootCorrelationId,
        }),
      ).resolves.toMatchObject({
        id: serviceCreatedConfigurationVersionId,
        workspaceId,
      });

      await expect(
        dataSource.getRepository(OutboxEventEntity).findOneBy({
          workspaceId,
          aggregateId: serviceCreatedConfigurationVersionId,
        }),
      ).resolves.toMatchObject({
        eventType: 'configuration.version.created',
        rootCorrelationId,
        state: 'PENDING',
      });
    } finally {
      await global.testDataSource.query(
        'DELETE FROM "core"."workspace" WHERE "id" = $1',
        [workspaceId],
      );
      if (connectionSource.isInitialized) {
        await connectionSource.destroy();
      }
    }
  });
});
