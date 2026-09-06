import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ConfigurationVersionEntity } from 'src/engine/core-modules/configuration-version/entities/configuration-version.entity';
import { ConfigurationVersionService } from 'src/engine/core-modules/configuration-version/services/configuration-version.service';
import { ConfigurationSnapshotService } from 'src/engine/core-modules/configuration-version/services/configuration-snapshot.service';
import { TransactionalOutboxModule } from 'src/engine/core-modules/transactional-outbox/transactional-outbox.module';
import { WorkspaceManyOrAllFlatEntityMapsCacheModule } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.module';
import { provideWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/provide-workspace-scoped-repository';
import { ConfigurationVersionResolver } from 'src/engine/core-modules/configuration-version/resolvers/configuration-version.resolver';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConfigurationVersionEntity]),
    PermissionsModule,
    TransactionalOutboxModule,
    WorkspaceManyOrAllFlatEntityMapsCacheModule,
  ],
  providers: [
    ConfigurationSnapshotService,
    ConfigurationVersionService,
    ConfigurationVersionResolver,
    provideWorkspaceScopedRepository(ConfigurationVersionEntity),
  ],
  exports: [ConfigurationSnapshotService, ConfigurationVersionService],
})
export class ConfigurationVersionModule {}
