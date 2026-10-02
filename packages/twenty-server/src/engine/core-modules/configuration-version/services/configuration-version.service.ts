import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { type DeepPartial, type EntityManager } from 'typeorm';
import { type QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

import { ConfigurationVersionEntity } from 'src/engine/core-modules/configuration-version/entities/configuration-version.entity';
import {
  type ConfigurationSnapshot,
  diffConfigurationSnapshots,
} from 'src/engine/core-modules/configuration-version/utils/diff-configuration-snapshots.util';
import { buildDeterministicDigest } from 'src/engine/core-modules/policy/utils/build-deterministic-digest.util';
import { TransactionalOutboxService } from 'src/engine/core-modules/transactional-outbox/services/transactional-outbox.service';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

@Injectable()
export class ConfigurationVersionService {
  constructor(
    @InjectWorkspaceScopedRepository(ConfigurationVersionEntity)
    private readonly repository: WorkspaceScopedRepository<ConfigurationVersionEntity>,
    private readonly transactionalOutboxService: TransactionalOutboxService,
  ) {}

  create({
    workspaceId,
    snapshot,
    ...version
  }: Readonly<{
    id: string;
    workspaceId: string;
    metadataVersion: number;
    platformVersion: string;
    changeSetId?: string;
    snapshot: ConfigurationSnapshot;
  }>): Promise<ConfigurationVersionEntity> {
    const entityInput = {
      ...version,
      changeSetId: version.changeSetId ?? null,
      snapshot,
      snapshotDigest: buildDeterministicDigest(snapshot),
    } as QueryDeepPartialEntity<ConfigurationVersionEntity>;

    return this.repository.insertAndReturnOne(workspaceId, entityInput);
  }

  list({
    workspaceId,
    limit,
  }: Readonly<{
    workspaceId: string;
    limit: number;
  }>): Promise<ConfigurationVersionEntity[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error('Configuration version list limit is invalid.');
    }

    return this.repository.find(workspaceId, {
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  createWithOutbox({
    rootCorrelationId,
    ...input
  }: Readonly<{
    id: string;
    workspaceId: string;
    metadataVersion: number;
    platformVersion: string;
    changeSetId?: string;
    snapshot: ConfigurationSnapshot;
    rootCorrelationId: string;
  }>): Promise<ConfigurationVersionEntity> {
    const entityInput = this.buildEntityInput(input);

    return this.transactionalOutboxService.execute({
      workspaceId: input.workspaceId,
      event: {
        id: randomUUID(),
        eventType: 'configuration.version.created',
        schemaVersion: 1,
        aggregateType: 'configurationVersion',
        aggregateId: input.id,
        payload: {
          configurationVersionId: input.id,
          metadataVersion: input.metadataVersion,
          changeSetId: input.changeSetId ?? null,
          snapshotDigest: entityInput.snapshotDigest,
        },
        rootCorrelationId,
      },
      mutate: (manager) => this.saveWithManager(manager, entityInput),
    });
  }

  async compare({
    workspaceId,
    fromVersionId,
    toVersionId,
  }: Readonly<{
    workspaceId: string;
    fromVersionId: string;
    toVersionId: string;
  }>) {
    const fromVersion = await this.repository.findOne(workspaceId, {
      where: { id: fromVersionId },
    });
    const toVersion = await this.repository.findOne(workspaceId, {
      where: { id: toVersionId },
    });

    if (fromVersion === null || toVersion === null) {
      throw new Error('Configuration version was not found.');
    }

    return diffConfigurationSnapshots(fromVersion.snapshot, toVersion.snapshot);
  }

  private buildEntityInput({
    workspaceId,
    snapshot,
    ...version
  }: Readonly<{
    id: string;
    workspaceId: string;
    metadataVersion: number;
    platformVersion: string;
    changeSetId?: string;
    snapshot: ConfigurationSnapshot;
  }>): DeepPartial<ConfigurationVersionEntity> {
    return {
      ...version,
      workspaceId,
      changeSetId: version.changeSetId ?? null,
      snapshot,
      snapshotDigest: buildDeterministicDigest(snapshot),
    };
  }

  private saveWithManager(
    manager: EntityManager,
    entityInput: DeepPartial<ConfigurationVersionEntity>,
  ): Promise<ConfigurationVersionEntity> {
    return manager.getRepository(ConfigurationVersionEntity).save(entityInput);
  }
}
