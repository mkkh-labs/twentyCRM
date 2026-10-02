import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.38.0', 1788242612256)
export class AddPolicyAuditEventFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE "core"."policyAuditEvent" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "eventKey" character varying(256) NOT NULL, "schemaVersion" smallint NOT NULL DEFAULT \'1\', "occurredAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "phase" character varying(32) NOT NULL, "actorType" character varying(32) NOT NULL, "actorId" uuid, "workspaceMemberId" uuid, "applicationId" uuid, "serviceAuthorityId" character varying(128), "authoritySource" character varying(32) NOT NULL, "operation" character varying(128) NOT NULL, "riskClass" character varying(2) NOT NULL, "resourceType" character varying(128) NOT NULL, "resourceId" character varying(256), "fieldMetadataIds" jsonb NOT NULL DEFAULT \'[]\'::jsonb, "policyDecisionId" uuid NOT NULL, "parentPolicyDecisionId" uuid, "policyOutcome" character varying(32) NOT NULL, "result" character varying(32) NOT NULL, "reasonCodes" jsonb NOT NULL DEFAULT \'[]\'::jsonb, "policyVersion" character varying(32) NOT NULL DEFAULT \'p0-v1\', "contextDigest" character(64) NOT NULL, "rootCorrelationId" uuid NOT NULL, "attemptId" uuid NOT NULL, "traceId" character varying(32), "workflowRunId" uuid, "jobId" character varying(256), "mutationOrEffectId" uuid, "metadata" jsonb NOT NULL DEFAULT \'{}\'::jsonb, CONSTRAINT "UQ_POLICY_AUDIT_WORKSPACE_EVENT_KEY" UNIQUE ("workspaceId", "eventKey"), CONSTRAINT "CHK_POLICY_AUDIT_CONTEXT_DIGEST" CHECK ("contextDigest" ~ \'^[a-f0-9]{64}$\'), CONSTRAINT "CHK_POLICY_AUDIT_SCHEMA_VERSION" CHECK ("schemaVersion" = 1), CONSTRAINT "PK_f8440e0c2bb1bb89d7396317355" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_POLICY_AUDIT_WORKSPACE_DECISION" ON "core"."policyAuditEvent" ("workspaceId", "policyDecisionId") ',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_POLICY_AUDIT_WORKSPACE_CORRELATION" ON "core"."policyAuditEvent" ("workspaceId", "rootCorrelationId") ',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_POLICY_AUDIT_WORKSPACE_OCCURRED" ON "core"."policyAuditEvent" ("workspaceId", "occurredAt") ',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_POLICY_AUDIT_UNRESOLVED_ALLOWED" ON "core"."policyAuditEvent" ("occurredAt", "workspaceId", "policyDecisionId") WHERE "policyOutcome" = \'ALLOW\' AND "result" = \'unknown\'',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."policyAuditEvent" ADD CONSTRAINT "FK_a0ee5fd0b0b4c209ea336b694a1" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "core"."policyAuditEvent" DROP CONSTRAINT "FK_a0ee5fd0b0b4c209ea336b694a1"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_POLICY_AUDIT_UNRESOLVED_ALLOWED"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_POLICY_AUDIT_WORKSPACE_OCCURRED"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_POLICY_AUDIT_WORKSPACE_CORRELATION"',
    );
    await queryRunner.query(
      'DROP INDEX "core"."IDX_POLICY_AUDIT_WORKSPACE_DECISION"',
    );
    await queryRunner.query('DROP TABLE "core"."policyAuditEvent"');
  }
}
