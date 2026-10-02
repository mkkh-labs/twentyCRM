import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.38.0', 1788244465291)
export class AddIdealCrmControlTablesFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE TABLE "core"."configurationVersion" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "metadataVersion" integer NOT NULL, "platformVersion" character varying(32) NOT NULL, "changeSetId" uuid, "snapshot" jsonb NOT NULL, "snapshotDigest" character(64) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_CONFIGURATION_VERSION_WORKSPACE_METADATA" UNIQUE ("workspaceId", "metadataVersion"), CONSTRAINT "CHK_CONFIGURATION_VERSION_SNAPSHOT_DIGEST" CHECK ("snapshotDigest" ~ \'^[a-f0-9]{64}$\'), CONSTRAINT "PK_bb75f25ab96d310a6c788081b9c" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_CONFIGURATION_VERSION_WORKSPACE_CREATED" ON "core"."configurationVersion" ("workspaceId", "createdAt") ');
    await queryRunner.query('CREATE TABLE "core"."metadataChangeSet" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "state" character varying(32) NOT NULL, "baseMetadataVersion" integer NOT NULL, "operations" jsonb NOT NULL, "dependencyImpact" jsonb NOT NULL, "createdByActorId" uuid NOT NULL, "approvedByActorId" uuid, "failureCode" character varying(64), "version" integer NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_METADATA_CHANGE_SET_BASE_VERSION" CHECK ("baseMetadataVersion" >= 0), CONSTRAINT "PK_e2bbfcf90f19a5d90dd50d32642" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_METADATA_CHANGE_SET_WORKSPACE_STATE" ON "core"."metadataChangeSet" ("workspaceId", "state") ');
    await queryRunner.query('CREATE TABLE "core"."agentActionApproval" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "actorId" uuid NOT NULL, "approverId" uuid NOT NULL, "action" character varying(128) NOT NULL, "target" character varying(256) NOT NULL, "riskClass" character varying(2) NOT NULL, "actionDigest" character(64) NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "consumedAt" TIMESTAMP WITH TIME ZONE, "consumedByDecisionId" uuid, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_AGENT_APPROVAL_ACTION_DIGEST" CHECK ("actionDigest" ~ \'^[a-f0-9]{64}$\'), CONSTRAINT "PK_a883669778fd67107c8d4a4958b" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_AGENT_APPROVAL_WORKSPACE_PENDING" ON "core"."agentActionApproval" ("workspaceId", "consumedAt", "expiresAt") ');
    await queryRunner.query('CREATE TABLE "core"."agentActionApprovalRequest" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "actorId" uuid NOT NULL, "action" character varying(128) NOT NULL, "target" character varying(256) NOT NULL, "riskClass" character varying(2) NOT NULL, "actionDigest" character(64) NOT NULL, "status" character varying(16) NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "approvalId" uuid, "workflowRunId" uuid, "workflowStepId" character varying(256), "rootCorrelationId" uuid, "originPolicyDecisionId" uuid, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_AGENT_APPROVAL_REQUEST_ACTION_DIGEST" CHECK ("actionDigest" ~ \'^[a-f0-9]{64}$\'), CONSTRAINT "PK_agent_action_approval_request" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_AGENT_APPROVAL_REQUEST_WORKSPACE_STATUS" ON "core"."agentActionApprovalRequest" ("workspaceId", "status", "expiresAt") ');
    await queryRunner.query('CREATE UNIQUE INDEX "UQ_AGENT_APPROVAL_REQUEST_PENDING_ACTION" ON "core"."agentActionApprovalRequest" ("workspaceId", "actorId", "actionDigest") WHERE "status" = \'PENDING\'');
    await queryRunner.query('CREATE TABLE "core"."outboxEvent" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "eventType" character varying(128) NOT NULL, "schemaVersion" smallint NOT NULL, "aggregateType" character varying(128) NOT NULL, "aggregateId" character varying(256) NOT NULL, "payload" jsonb NOT NULL, "payloadDigest" character(64) NOT NULL, "rootCorrelationId" uuid NOT NULL, "state" character varying(32) NOT NULL, "attemptCount" integer NOT NULL DEFAULT \'0\', "availableAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "publishedAt" TIMESTAMP WITH TIME ZONE, "lastErrorCode" character varying(64), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_OUTBOX_EVENT_PAYLOAD_DIGEST" CHECK ("payloadDigest" ~ \'^[a-f0-9]{64}$\'), CONSTRAINT "CHK_OUTBOX_EVENT_SCHEMA_VERSION" CHECK ("schemaVersion" > 0), CONSTRAINT "PK_d0b0718475d87c2bd12f178ce9f" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_OUTBOX_EVENT_WORKSPACE_AGGREGATE" ON "core"."outboxEvent" ("workspaceId", "aggregateType", "aggregateId") ');
    await queryRunner.query('CREATE INDEX "IDX_OUTBOX_EVENT_STATE_AVAILABLE" ON "core"."outboxEvent" ("state", "availableAt") ');
    await queryRunner.query('CREATE TABLE "core"."workflowEffectExecution" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "effectKey" character(64) NOT NULL, "workflowRunId" uuid NOT NULL, "stepId" character varying(256) NOT NULL, "actionDigest" character(64) NOT NULL, "state" character varying(32) NOT NULL, "attemptCount" integer NOT NULL DEFAULT \'0\', "retryAt" TIMESTAMP WITH TIME ZONE, "providerClass" character varying(64) NOT NULL, "providerReferenceDigest" character(64), "lastErrorCode" character varying(64), "uncertaintyReason" character varying(128), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_WORKFLOW_EFFECT_WORKSPACE_KEY" UNIQUE ("workspaceId", "effectKey"), CONSTRAINT "CHK_WORKFLOW_EFFECT_ACTION_DIGEST" CHECK ("actionDigest" ~ \'^[a-f0-9]{64}$\'), CONSTRAINT "CHK_WORKFLOW_EFFECT_KEY" CHECK ("effectKey" ~ \'^[a-f0-9]{64}$\'), CONSTRAINT "PK_01971a614af873add4fef896d24" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_WORKFLOW_EFFECT_WORKSPACE_RUN" ON "core"."workflowEffectExecution" ("workspaceId", "workflowRunId") ');
    await queryRunner.query('CREATE INDEX "IDX_WORKFLOW_EFFECT_WORKSPACE_STATE_RETRY" ON "core"."workflowEffectExecution" ("workspaceId", "state", "retryAt") ');
    await queryRunner.query('ALTER TABLE "core"."configurationVersion" ADD CONSTRAINT "FK_c6e953f54d9b56574be8b00c845" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."metadataChangeSet" ADD CONSTRAINT "FK_257cfe8052ca28fbac96ea9bb37" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."agentActionApproval" ADD CONSTRAINT "FK_85b04d83ea3f65a8ba830275b65" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."agentActionApprovalRequest" ADD CONSTRAINT "FK_agent_action_approval_request_workspace" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."outboxEvent" ADD CONSTRAINT "FK_fba793a21fea54d065865b93046" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."workflowEffectExecution" ADD CONSTRAINT "FK_ad62d3810c366e5a7399c35e65e" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "core"."workflowEffectExecution" DROP CONSTRAINT "FK_ad62d3810c366e5a7399c35e65e"');
    await queryRunner.query('ALTER TABLE "core"."outboxEvent" DROP CONSTRAINT "FK_fba793a21fea54d065865b93046"');
    await queryRunner.query('ALTER TABLE "core"."agentActionApproval" DROP CONSTRAINT "FK_85b04d83ea3f65a8ba830275b65"');
    await queryRunner.query('ALTER TABLE "core"."agentActionApprovalRequest" DROP CONSTRAINT "FK_agent_action_approval_request_workspace"');
    await queryRunner.query('ALTER TABLE "core"."metadataChangeSet" DROP CONSTRAINT "FK_257cfe8052ca28fbac96ea9bb37"');
    await queryRunner.query('ALTER TABLE "core"."configurationVersion" DROP CONSTRAINT "FK_c6e953f54d9b56574be8b00c845"');
    await queryRunner.query('DROP INDEX "core"."IDX_WORKFLOW_EFFECT_WORKSPACE_STATE_RETRY"');
    await queryRunner.query('DROP INDEX "core"."IDX_WORKFLOW_EFFECT_WORKSPACE_RUN"');
    await queryRunner.query('DROP TABLE "core"."workflowEffectExecution"');
    await queryRunner.query('DROP INDEX "core"."IDX_OUTBOX_EVENT_STATE_AVAILABLE"');
    await queryRunner.query('DROP INDEX "core"."IDX_OUTBOX_EVENT_WORKSPACE_AGGREGATE"');
    await queryRunner.query('DROP TABLE "core"."outboxEvent"');
    await queryRunner.query('DROP INDEX "core"."IDX_AGENT_APPROVAL_WORKSPACE_PENDING"');
    await queryRunner.query('DROP INDEX "core"."UQ_AGENT_APPROVAL_REQUEST_PENDING_ACTION"');
    await queryRunner.query('DROP INDEX "core"."IDX_AGENT_APPROVAL_REQUEST_WORKSPACE_STATUS"');
    await queryRunner.query('DROP TABLE "core"."agentActionApprovalRequest"');
    await queryRunner.query('DROP TABLE "core"."agentActionApproval"');
    await queryRunner.query('DROP INDEX "core"."IDX_METADATA_CHANGE_SET_WORKSPACE_STATE"');
    await queryRunner.query('DROP TABLE "core"."metadataChangeSet"');
    await queryRunner.query('DROP INDEX "core"."IDX_CONFIGURATION_VERSION_WORKSPACE_CREATED"');
    await queryRunner.query('DROP TABLE "core"."configurationVersion"');
  }
}
