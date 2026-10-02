import { QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.38.0', 1788259000000)
export class AddOutboxConsumerReceiptFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE TABLE "core"."outboxConsumerReceipt" ("workspaceId" uuid NOT NULL, "id" uuid NOT NULL, "outboxEventId" uuid NOT NULL, "consumerName" character varying(128) NOT NULL, "state" character varying(32) NOT NULL, "lastErrorCode" character varying(64), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_OUTBOX_CONSUMER_RECEIPT_EVENT_CONSUMER" UNIQUE ("outboxEventId", "consumerName"), CONSTRAINT "PK_outbox_consumer_receipt" PRIMARY KEY ("id"))');
    await queryRunner.query('CREATE INDEX "IDX_OUTBOX_CONSUMER_RECEIPT_WORKSPACE_STATE" ON "core"."outboxConsumerReceipt" ("workspaceId", "state") ');
    await queryRunner.query('ALTER TABLE "core"."outboxConsumerReceipt" ADD CONSTRAINT "FK_OUTBOX_CONSUMER_RECEIPT_WORKSPACE" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
    await queryRunner.query('ALTER TABLE "core"."outboxConsumerReceipt" ADD CONSTRAINT "FK_OUTBOX_CONSUMER_RECEIPT_EVENT" FOREIGN KEY ("outboxEventId") REFERENCES "core"."outboxEvent"("id") ON DELETE CASCADE ON UPDATE NO ACTION');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "core"."outboxConsumerReceipt" DROP CONSTRAINT "FK_OUTBOX_CONSUMER_RECEIPT_EVENT"');
    await queryRunner.query('ALTER TABLE "core"."outboxConsumerReceipt" DROP CONSTRAINT "FK_OUTBOX_CONSUMER_RECEIPT_WORKSPACE"');
    await queryRunner.query('DROP INDEX "core"."IDX_OUTBOX_CONSUMER_RECEIPT_WORKSPACE_STATE"');
    await queryRunner.query('DROP TABLE "core"."outboxConsumerReceipt"');
  }
}
