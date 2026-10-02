import { DataSource, QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { SlowInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/slow-instance-command.interface';

@RegisteredInstanceCommand('2.38.0', 1790861186135, { type: 'slow' })
export class AlignIdealCrmSchemaMetadataSlowInstanceCommand implements SlowInstanceCommand {
  public async runDataMigration(_dataSource: DataSource): Promise<void> {}

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "core"."outboxConsumerReceipt" DROP CONSTRAINT "FK_OUTBOX_CONSUMER_RECEIPT_WORKSPACE"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."agentActionApprovalRequest" DROP CONSTRAINT "FK_agent_action_approval_request_workspace"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."outboxConsumerReceipt" ADD CONSTRAINT "FK_f2e084a39f3f522268ee3ecba84" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."agentActionApprovalRequest" ADD CONSTRAINT "FK_c2e083e28c3a9547925d4e755d7" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "core"."agentActionApprovalRequest" DROP CONSTRAINT "FK_c2e083e28c3a9547925d4e755d7"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."outboxConsumerReceipt" DROP CONSTRAINT "FK_f2e084a39f3f522268ee3ecba84"',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."agentActionApprovalRequest" ADD CONSTRAINT "FK_agent_action_approval_request_workspace" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "core"."outboxConsumerReceipt" ADD CONSTRAINT "FK_OUTBOX_CONSUMER_RECEIPT_WORKSPACE" FOREIGN KEY ("workspaceId") REFERENCES "core"."workspace"("id") ON DELETE CASCADE ON UPDATE NO ACTION',
    );
  }
}
