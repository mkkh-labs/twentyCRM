import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WorkspaceExportCommand } from 'src/database/commands/workspace-export/workspace-export.command';
import { WorkspaceExportService } from 'src/database/commands/workspace-export/workspace-export.service';
import { WorkspaceImportCommand } from 'src/database/commands/workspace-export/workspace-import.command';
import { WorkspaceImportService } from 'src/database/commands/workspace-export/workspace-import.service';
import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { SearchFieldMetadataEntity } from 'src/engine/metadata-modules/search-field-metadata/search-field-metadata.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ObjectMetadataEntity,
      FieldMetadataEntity,
      SearchFieldMetadataEntity,
    ]),
  ],
  providers: [
    WorkspaceExportCommand,
    WorkspaceExportService,
    WorkspaceImportCommand,
    WorkspaceImportService,
  ],
})
export class WorkspaceExportModule {}
