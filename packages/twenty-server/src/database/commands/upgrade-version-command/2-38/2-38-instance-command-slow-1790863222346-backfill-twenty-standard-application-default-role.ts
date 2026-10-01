import { DataSource, QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { SlowInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/slow-instance-command.interface';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';

@RegisteredInstanceCommand('2.38.0', 1790863222346, { type: 'slow' })
export class BackfillTwentyStandardApplicationDefaultRoleSlowInstanceCommand implements SlowInstanceCommand {
  public async runDataMigration(dataSource: DataSource): Promise<void> {
    await dataSource.query(
      `UPDATE "core"."application" "application"
       SET "defaultRoleId" = "role"."id"
       FROM "core"."role" "role"
       WHERE "application"."universalIdentifier" = $1
       AND "application"."defaultRoleId" IS NULL
       AND "application"."deletedAt" IS NULL
       AND "role"."universalIdentifier" = $2
       AND "role"."workspaceId" = "application"."workspaceId"
       AND "role"."applicationId" = "application"."id"`,
      [
        TWENTY_STANDARD_APPLICATION.universalIdentifier,
        STANDARD_ROLE.admin.universalIdentifier,
      ],
    );
  }

  public async up(_queryRunner: QueryRunner): Promise<void> {}

  // Existing role assignments cannot be distinguished from backfilled rows.
  public async down(_queryRunner: QueryRunner): Promise<void> {}
}
