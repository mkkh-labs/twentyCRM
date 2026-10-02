import { Logger } from '@nestjs/common';
import { Command, CommandRunner, Option } from 'nest-commander';

import { readWorkspaceExportEncryptionSecret } from 'src/database/commands/workspace-export/utils/read-workspace-export-encryption-secret.util';
import { WorkspaceImportService } from 'src/database/commands/workspace-export/workspace-import.service';

type WorkspaceImportCommandOptions = {
  manifestPath: string;
  encryptionKeyFile: string;
};

@Command({
  name: 'workspace:import',
  description: 'Import an encrypted, version-bound workspace export bundle',
})
export class WorkspaceImportCommand extends CommandRunner {
  private readonly logger = new Logger(WorkspaceImportCommand.name);

  constructor(private readonly workspaceImportService: WorkspaceImportService) {
    super();
  }

  @Option({
    flags: '--manifest-path <manifestPath>',
    description: 'Path to the workspace export manifest',
    required: true,
  })
  parseManifestPath(value: string): string {
    return value;
  }

  @Option({
    flags: '--encryption-key-file <encryptionKeyFile>',
    description: 'Owner-readable file containing the export encryption secret',
    required: true,
  })
  parseEncryptionKeyFile(value: string): string {
    return value;
  }

  async run(
    _passedParams: string[],
    options: WorkspaceImportCommandOptions,
  ): Promise<void> {
    const manifest = await this.workspaceImportService.importWorkspace({
      manifestFilePath: options.manifestPath,
      encryptionSecret: await readWorkspaceExportEncryptionSecret(
        options.encryptionKeyFile,
      ),
    });

    this.logger.log(
      `Import verified: workspaceId=${manifest.workspaceId} exportId=${manifest.exportId}`,
    );
  }
}
