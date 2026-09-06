import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.38.0', 1788273684000)
export class BindMetadataApprovalsFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "core"."metadataChangeSet" ADD "approvalId" uuid',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."metadataChangeSet" ADD "approvalAction" character varying(128)',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."metadataChangeSet" ADD "approvalActionDigest" character(64)',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."metadataChangeSet" ADD "approvalExpiresAt" TIMESTAMP WITH TIME ZONE',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."metadataChangeSet" ADD CONSTRAINT "CHK_METADATA_CHANGE_SET_APPROVAL_ACTION_DIGEST" CHECK ("approvalActionDigest" IS NULL OR "approvalActionDigest" ~ \'^[a-f0-9]{64}$\')',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."metadataChangeSet" ADD CONSTRAINT "CHK_METADATA_CHANGE_SET_APPROVAL_ACTION" CHECK ("approvalAction" IS NULL OR "approvalAction" IN (\'metadata.changeSet.apply\', \'metadata.changeSet.rollback\'))',
    );
    await queryRunner.query(
      `ALTER TABLE "core"."metadataChangeSet" ADD CONSTRAINT "CHK_METADATA_CHANGE_SET_APPROVAL_BINDING" CHECK (
        ("approvalId" IS NULL AND "approvalAction" IS NULL AND "approvalActionDigest" IS NULL AND "approvalExpiresAt" IS NULL)
        OR
        ("approvalId" IS NOT NULL AND "approvalAction" IS NOT NULL AND "approvalActionDigest" IS NOT NULL AND "approvalExpiresAt" IS NOT NULL AND "approvedByActorId" IS NOT NULL AND "applyTokenDigest" IS NOT NULL)
      )`,
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_METADATA_CHANGE_SET_WORKSPACE_APPROVAL" ON "core"."metadataChangeSet" ("workspaceId", "approvalId") WHERE "approvalId" IS NOT NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX "core"."IDX_METADATA_CHANGE_SET_WORKSPACE_APPROVAL"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."metadataChangeSet" DROP CONSTRAINT "CHK_METADATA_CHANGE_SET_APPROVAL_BINDING"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."metadataChangeSet" DROP CONSTRAINT "CHK_METADATA_CHANGE_SET_APPROVAL_ACTION"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."metadataChangeSet" DROP CONSTRAINT "CHK_METADATA_CHANGE_SET_APPROVAL_ACTION_DIGEST"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."metadataChangeSet" DROP COLUMN "approvalExpiresAt"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."metadataChangeSet" DROP COLUMN "approvalActionDigest"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."metadataChangeSet" DROP COLUMN "approvalAction"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."metadataChangeSet" DROP COLUMN "approvalId"',
    );
  }
}
