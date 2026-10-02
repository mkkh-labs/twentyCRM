import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.38.0', 1788653932000)
export class BindOutboxReceiptToWorkspaceEventFastInstanceCommand implements FastInstanceCommand {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "core"."outboxEvent" ADD CONSTRAINT "UQ_OUTBOX_EVENT_WORKSPACE_ID" UNIQUE ("workspaceId", "id")',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."outboxConsumerReceipt" DROP CONSTRAINT "FK_OUTBOX_CONSUMER_RECEIPT_EVENT"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."outboxConsumerReceipt" DROP CONSTRAINT "UQ_OUTBOX_CONSUMER_RECEIPT_EVENT_CONSUMER"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."outboxConsumerReceipt" ADD CONSTRAINT "UQ_OUTBOX_CONSUMER_RECEIPT_EVENT_CONSUMER" UNIQUE ("workspaceId", "outboxEventId", "consumerName")',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."outboxConsumerReceipt" ADD CONSTRAINT "FK_OUTBOX_CONSUMER_RECEIPT_EVENT" FOREIGN KEY ("workspaceId", "outboxEventId") REFERENCES "core"."outboxEvent"("workspaceId", "id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "core"."outboxConsumerReceipt" DROP CONSTRAINT "FK_OUTBOX_CONSUMER_RECEIPT_EVENT"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."outboxConsumerReceipt" DROP CONSTRAINT "UQ_OUTBOX_CONSUMER_RECEIPT_EVENT_CONSUMER"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."outboxConsumerReceipt" ADD CONSTRAINT "UQ_OUTBOX_CONSUMER_RECEIPT_EVENT_CONSUMER" UNIQUE ("outboxEventId", "consumerName")',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."outboxConsumerReceipt" ADD CONSTRAINT "FK_OUTBOX_CONSUMER_RECEIPT_EVENT" FOREIGN KEY ("outboxEventId") REFERENCES "core"."outboxEvent"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."outboxEvent" DROP CONSTRAINT "UQ_OUTBOX_EVENT_WORKSPACE_ID"',
    );
  }
}
