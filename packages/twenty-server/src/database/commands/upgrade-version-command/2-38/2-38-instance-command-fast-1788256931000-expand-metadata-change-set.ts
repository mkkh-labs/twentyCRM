import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.38.0', 1788256931000)
export class ExpandMetadataChangeSetFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "core"."metadataChangeSet" ADD "migrationPlan" jsonb');
    await queryRunner.query('ALTER TABLE "core"."metadataChangeSet" ADD "applicationUniversalIdentifier" character varying(128)');
    await queryRunner.query('ALTER TABLE "core"."metadataChangeSet" ADD "rollbackPlan" jsonb');
    await queryRunner.query('ALTER TABLE "core"."metadataChangeSet" ADD "recoveryStrategy" character varying(16)');
    await queryRunner.query('ALTER TABLE "core"."metadataChangeSet" ADD "dependencyResolutionDigest" character(64)');
    await queryRunner.query('ALTER TABLE "core"."metadataChangeSet" ADD "applyTokenDigest" character(64)');
    await queryRunner.query('ALTER TABLE "core"."metadataChangeSet" ADD "riskClass" character varying(2)');
    await queryRunner.query('ALTER TABLE "core"."metadataChangeSet" ADD "compatibilityFindings" jsonb NOT NULL DEFAULT \'[]\'::jsonb');
    await queryRunner.query('ALTER TABLE "core"."metadataChangeSet" ADD "appliedMetadataVersion" integer');
    await queryRunner.query('ALTER TABLE "core"."metadataChangeSet" ADD CONSTRAINT "CHK_METADATA_CHANGE_SET_DEPENDENCY_DIGEST" CHECK ("dependencyResolutionDigest" IS NULL OR "dependencyResolutionDigest" ~ \'^[a-f0-9]{64}$\')');
    await queryRunner.query('ALTER TABLE "core"."metadataChangeSet" ADD CONSTRAINT "CHK_METADATA_CHANGE_SET_APPLY_TOKEN_DIGEST" CHECK ("applyTokenDigest" IS NULL OR "applyTokenDigest" ~ \'^[a-f0-9]{64}$\')');
    await queryRunner.query('ALTER TABLE "core"."metadataChangeSet" ADD CONSTRAINT "CHK_METADATA_CHANGE_SET_RISK_CLASS" CHECK ("riskClass" IS NULL OR "riskClass" IN (\'R1\', \'R2\', \'R3\'))');
    await queryRunner.query('ALTER TABLE "core"."metadataChangeSet" ADD CONSTRAINT "CHK_METADATA_CHANGE_SET_RECOVERY_STRATEGY" CHECK ("recoveryStrategy" IS NULL OR "recoveryStrategy" IN (\'ROLLBACK\', \'FORWARD_FIX\'))');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "core"."metadataChangeSet" DROP CONSTRAINT "CHK_METADATA_CHANGE_SET_RECOVERY_STRATEGY"');
    await queryRunner.query('ALTER TABLE "core"."metadataChangeSet" DROP CONSTRAINT "CHK_METADATA_CHANGE_SET_RISK_CLASS"');
    await queryRunner.query('ALTER TABLE "core"."metadataChangeSet" DROP CONSTRAINT "CHK_METADATA_CHANGE_SET_APPLY_TOKEN_DIGEST"');
    await queryRunner.query('ALTER TABLE "core"."metadataChangeSet" DROP CONSTRAINT "CHK_METADATA_CHANGE_SET_DEPENDENCY_DIGEST"');
    await queryRunner.query('ALTER TABLE "core"."metadataChangeSet" DROP COLUMN "appliedMetadataVersion"');
    await queryRunner.query('ALTER TABLE "core"."metadataChangeSet" DROP COLUMN "compatibilityFindings"');
    await queryRunner.query('ALTER TABLE "core"."metadataChangeSet" DROP COLUMN "riskClass"');
    await queryRunner.query('ALTER TABLE "core"."metadataChangeSet" DROP COLUMN "applyTokenDigest"');
    await queryRunner.query('ALTER TABLE "core"."metadataChangeSet" DROP COLUMN "dependencyResolutionDigest"');
    await queryRunner.query('ALTER TABLE "core"."metadataChangeSet" DROP COLUMN "recoveryStrategy"');
    await queryRunner.query('ALTER TABLE "core"."metadataChangeSet" DROP COLUMN "rollbackPlan"');
    await queryRunner.query('ALTER TABLE "core"."metadataChangeSet" DROP COLUMN "applicationUniversalIdentifier"');
    await queryRunner.query('ALTER TABLE "core"."metadataChangeSet" DROP COLUMN "migrationPlan"');
  }
}
