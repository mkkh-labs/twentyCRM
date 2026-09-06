import { DataSource, QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { SlowInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/slow-instance-command.interface';

@RegisteredInstanceCommand('2.38.0', 1788275870000, { type: 'slow' })
export class InvalidateUnboundMetadataApprovalsSlowInstanceCommand implements SlowInstanceCommand {
  async runDataMigration(dataSource: DataSource): Promise<void> {
    await dataSource.query(
      `UPDATE "core"."metadataChangeSet"
       SET "state" = 'PLANNED',
           "applyTokenDigest" = NULL,
           "approvedByActorId" = NULL,
           "version" = "version" + 1
       WHERE "state" IN ('VALIDATED', 'APPROVED')
         AND "approvalId" IS NULL`,
    );
  }

  public async up(_queryRunner: QueryRunner): Promise<void> {
    return;
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    return;
  }
}
