import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MetadataChangeSetEntity } from 'src/engine/core-modules/metadata-change-set/entities/metadata-change-set.entity';
import { ApplicationEntity } from 'src/engine/core-modules/application/application.entity';
import { MetadataDependencyAnalyzerService } from 'src/engine/core-modules/metadata-change-set/services/metadata-dependency-analyzer.service';
import { MetadataChangeSetService } from 'src/engine/core-modules/metadata-change-set/services/metadata-change-set.service';
import { MetadataChangeSetApplyService } from 'src/engine/core-modules/metadata-change-set/services/metadata-change-set-apply.service';
import { MetadataDeletionPlanService } from 'src/engine/core-modules/metadata-change-set/services/metadata-deletion-plan.service';
import { MetadataChangeSetResolver } from 'src/engine/core-modules/metadata-change-set/resolvers/metadata-change-set.resolver';
import { ConfigurationVersionModule } from 'src/engine/core-modules/configuration-version/configuration-version.module';
import { PolicyModule } from 'src/engine/core-modules/policy/policy.module';
import { WorkflowVersionEntity } from 'src/engine/core-modules/workflow/entities/workflow-version.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { ViewFieldEntity } from 'src/engine/metadata-modules/view-field/entities/view-field.entity';
import { ViewFilterEntity } from 'src/engine/metadata-modules/view-filter/entities/view-filter.entity';
import { ViewSortEntity } from 'src/engine/metadata-modules/view-sort/entities/view-sort.entity';
import { ViewEntity } from 'src/engine/metadata-modules/view/entities/view.entity';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { provideWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/provide-workspace-scoped-repository';
import { WorkspaceMigrationModule } from 'src/engine/workspace-manager/workspace-migration/workspace-migration.module';
import { WorkspaceMetadataVersionModule } from 'src/engine/metadata-modules/workspace-metadata-version/workspace-metadata-version.module';
import { TwentyOrmModule } from 'src/engine/twenty-orm/twenty-orm.module';
import { ApplicationModule } from 'src/engine/core-modules/application/application.module';
import { WorkspaceManyOrAllFlatEntityMapsCacheModule } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.module';

@Module({
  imports: [
    ConfigurationVersionModule,
    ApplicationModule,
    PermissionsModule,
    PolicyModule,
    TwentyOrmModule,
    WorkspaceMetadataVersionModule,
    WorkspaceMigrationModule,
    WorkspaceManyOrAllFlatEntityMapsCacheModule,
    TypeOrmModule.forFeature([
      ApplicationEntity,
      FieldMetadataEntity,
      MetadataChangeSetEntity,
      ObjectMetadataEntity,
      ViewEntity,
      ViewFieldEntity,
      ViewFilterEntity,
      ViewSortEntity,
      WorkflowVersionEntity,
      WorkspaceEntity,
    ]),
  ],
  providers: [
    MetadataChangeSetApplyService,
    MetadataChangeSetResolver,
    MetadataChangeSetService,
    MetadataDependencyAnalyzerService,
    MetadataDeletionPlanService,
    provideWorkspaceScopedRepository(ApplicationEntity),
    provideWorkspaceScopedRepository(FieldMetadataEntity),
    provideWorkspaceScopedRepository(MetadataChangeSetEntity),
    provideWorkspaceScopedRepository(ObjectMetadataEntity),
    provideWorkspaceScopedRepository(ViewEntity),
    provideWorkspaceScopedRepository(ViewFieldEntity),
    provideWorkspaceScopedRepository(ViewFilterEntity),
    provideWorkspaceScopedRepository(ViewSortEntity),
    provideWorkspaceScopedRepository(WorkflowVersionEntity),
  ],
  exports: [MetadataChangeSetApplyService, MetadataChangeSetService],
})
export class MetadataChangeSetModule {}
