import { Injectable } from '@nestjs/common';

import { In } from 'typeorm';

import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import {
  type MetadataChangeOperation,
  type MetadataDependencyImpact,
} from 'src/engine/core-modules/metadata-change-set/entities/metadata-change-set.entity';
import { WorkflowVersionEntity } from 'src/engine/core-modules/workflow/entities/workflow-version.entity';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { ViewFieldEntity } from 'src/engine/metadata-modules/view-field/entities/view-field.entity';
import { ViewFilterEntity } from 'src/engine/metadata-modules/view-filter/entities/view-filter.entity';
import { ViewSortEntity } from 'src/engine/metadata-modules/view-sort/entities/view-sort.entity';
import { ViewEntity } from 'src/engine/metadata-modules/view/entities/view.entity';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

@Injectable()
export class MetadataDependencyAnalyzerService {
  constructor(
    @InjectWorkspaceScopedRepository(ObjectMetadataEntity)
    private readonly objectRepository: WorkspaceScopedRepository<ObjectMetadataEntity>,
    @InjectWorkspaceScopedRepository(FieldMetadataEntity)
    private readonly fieldRepository: WorkspaceScopedRepository<FieldMetadataEntity>,
    @InjectWorkspaceScopedRepository(ViewEntity)
    private readonly viewRepository: WorkspaceScopedRepository<ViewEntity>,
    @InjectWorkspaceScopedRepository(ViewFieldEntity)
    private readonly viewFieldRepository: WorkspaceScopedRepository<ViewFieldEntity>,
    @InjectWorkspaceScopedRepository(ViewFilterEntity)
    private readonly viewFilterRepository: WorkspaceScopedRepository<ViewFilterEntity>,
    @InjectWorkspaceScopedRepository(ViewSortEntity)
    private readonly viewSortRepository: WorkspaceScopedRepository<ViewSortEntity>,
    @InjectWorkspaceScopedRepository(WorkflowVersionEntity)
    private readonly workflowVersionRepository: WorkspaceScopedRepository<WorkflowVersionEntity>,
    @InjectWorkspaceScopedRepository(ApplicationEntity)
    private readonly applicationRepository: WorkspaceScopedRepository<ApplicationEntity>,
  ) {}

  async analyze({
    workspaceId,
    operations,
  }: Readonly<{
    workspaceId: string;
    operations: readonly MetadataChangeOperation[];
  }>): Promise<MetadataDependencyImpact> {
    const universalIdentifiers = operations.map(
      ({ universalIdentifier }) => universalIdentifier,
    );
    const [objects, fields, applications] = await Promise.all([
      this.findObjects(workspaceId, universalIdentifiers),
      this.findFields(workspaceId, universalIdentifiers),
      this.findApplications(workspaceId, universalIdentifiers),
    ]);
    const objectIds = new Set(objects.map(({ id }) => id));
    const fieldIds = new Set(fields.map(({ id }) => id));
    const identifiers = new Set([
      ...universalIdentifiers,
      ...objectIds,
      ...fieldIds,
    ]);
    const [views, viewFields, viewFilters, viewSorts, workflowVersions] =
      await Promise.all([
        objectIds.size === 0
          ? []
          : this.viewRepository.find(workspaceId, {
              select: ['id'],
              where: { objectMetadataId: In([...objectIds]) },
            }),
        fieldIds.size === 0
          ? []
          : this.viewFieldRepository.find(workspaceId, {
              select: ['viewId'],
              where: { fieldMetadataId: In([...fieldIds]) },
            }),
        fieldIds.size === 0
          ? []
          : this.viewFilterRepository.find(workspaceId, {
              select: ['viewId'],
              where: [
                { fieldMetadataId: In([...fieldIds]) },
                { relationTargetFieldMetadataId: In([...fieldIds]) },
              ],
            }),
        fieldIds.size === 0
          ? []
          : this.viewSortRepository.find(workspaceId, {
              select: ['viewId'],
              where: { fieldMetadataId: In([...fieldIds]) },
            }),
        this.workflowVersionRepository.find(workspaceId, {
          select: ['id', 'triggers', 'steps'],
        }),
      ]);
    const relatedFields = await this.findRelatedFields(workspaceId, [
      ...objectIds,
      ...fieldIds,
    ]);
    const workflowIds = workflowVersions
      .filter(({ triggers, steps }) =>
        this.containsAnyIdentifier({ triggers, steps }, identifiers),
      )
      .map(({ id }) => id);
    const viewIds = new Set([
      ...views.map(({ id }) => id),
      ...viewFields.map(({ viewId }) => viewId),
      ...viewFilters.map(({ viewId }) => viewId),
      ...viewSorts.map(({ viewId }) => viewId),
    ]);
    const applicationIds = new Set([
      ...objects.map(({ applicationId }) => applicationId),
      ...fields.map(({ applicationId }) => applicationId),
      ...applications.map(({ id }) => id),
    ]);

    return {
      workflows: [...new Set(workflowIds)].sort(),
      views: [...viewIds].sort(),
      applications: [...applicationIds].sort(),
      contracts: operations
        .filter(({ operation }) => operation !== 'CREATE')
        .map(
          ({ metadataType, universalIdentifier }) =>
            `${metadataType}:${universalIdentifier}`,
        )
        .sort(),
      metadata: relatedFields
        .map(({ universalIdentifier }) => universalIdentifier)
        .sort(),
    };
  }

  private findObjects(workspaceId: string, universalIdentifiers: string[]) {
    return universalIdentifiers.length === 0
      ? Promise.resolve([])
      : this.objectRepository.find(workspaceId, {
          select: ['id', 'applicationId'],
          where: { universalIdentifier: In(universalIdentifiers) },
        });
  }

  private findFields(workspaceId: string, universalIdentifiers: string[]) {
    return universalIdentifiers.length === 0
      ? Promise.resolve([])
      : this.fieldRepository.find(workspaceId, {
          select: ['id', 'applicationId'],
          where: { universalIdentifier: In(universalIdentifiers) },
        });
  }

  private findApplications(
    workspaceId: string,
    universalIdentifiers: string[],
  ) {
    return universalIdentifiers.length === 0
      ? Promise.resolve([])
      : this.applicationRepository.find(workspaceId, {
          select: ['id'],
          where: { universalIdentifier: In(universalIdentifiers) },
        });
  }

  private findRelatedFields(workspaceId: string, targetIds: string[]) {
    return targetIds.length === 0
      ? Promise.resolve([])
      : this.fieldRepository.find(workspaceId, {
          select: ['universalIdentifier'],
          where: [
            { relationTargetFieldMetadataId: In(targetIds) },
            { relationTargetObjectMetadataId: In(targetIds) },
          ],
        });
  }

  private containsAnyIdentifier(
    value: unknown,
    identifiers: ReadonlySet<string>,
  ): boolean {
    if (typeof value === 'string') {
      return identifiers.has(value);
    }
    if (Array.isArray(value)) {
      return value.some((item) =>
        this.containsAnyIdentifier(item, identifiers),
      );
    }
    if (value !== null && typeof value === 'object') {
      return Object.values(value).some((item) =>
        this.containsAnyIdentifier(item, identifiers),
      );
    }

    return false;
  }
}
