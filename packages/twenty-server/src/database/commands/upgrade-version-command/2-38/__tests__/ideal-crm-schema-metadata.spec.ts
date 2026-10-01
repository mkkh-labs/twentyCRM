import { getMetadataArgsStorage, type QueryRunner } from 'typeorm';

import { AlignIdealCrmSchemaMetadataFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-38/2-38-instance-command-fast-1790861186135-align-ideal-crm-schema-metadata';
import { MetadataChangeSetEntity } from 'src/engine/core-modules/metadata-change-set/entities/metadata-change-set.entity';
import { OutboxConsumerReceiptEntity } from 'src/engine/core-modules/transactional-outbox/entities/outbox-consumer-receipt.entity';

describe('Ideal CRM schema metadata', () => {
  it('keeps metadata change-set constraints visible to schema generation', () => {
    const metadataStorage = getMetadataArgsStorage();
    const checkNames = metadataStorage.checks
      .filter(({ target }) => target === MetadataChangeSetEntity)
      .map(({ name }) => name);
    const approvalIndex = metadataStorage.indices.find(
      ({ name, target }) =>
        target === MetadataChangeSetEntity &&
        name === 'IDX_METADATA_CHANGE_SET_WORKSPACE_APPROVAL',
    );

    expect(checkNames).toEqual(
      expect.arrayContaining([
        'CHK_METADATA_CHANGE_SET_DEPENDENCY_DIGEST',
        'CHK_METADATA_CHANGE_SET_APPLY_TOKEN_DIGEST',
        'CHK_METADATA_CHANGE_SET_RISK_CLASS',
        'CHK_METADATA_CHANGE_SET_RECOVERY_STRATEGY',
        'CHK_METADATA_CHANGE_SET_APPROVAL_ACTION_DIGEST',
        'CHK_METADATA_CHANGE_SET_APPROVAL_ACTION',
        'CHK_METADATA_CHANGE_SET_APPROVAL_BINDING',
      ]),
    );
    expect(approvalIndex?.columns).toEqual(['workspaceId', 'approvalId']);
    expect(approvalIndex).toMatchObject({
      unique: true,
      where: '"approvalId" IS NOT NULL',
    });
  });

  it('keeps the receipt-to-event tenant binding visible to schema generation', () => {
    const metadataStorage = getMetadataArgsStorage();
    const relation = metadataStorage.relations.find(
      ({ propertyName, target }) =>
        target === OutboxConsumerReceiptEntity && propertyName === 'outboxEvent',
    );
    const joinColumns = metadataStorage.joinColumns
      .filter(
        ({ propertyName, target }) =>
          target === OutboxConsumerReceiptEntity &&
          propertyName === 'outboxEvent',
      )
      .map(({ foreignKeyConstraintName, name, referencedColumnName }) => ({
        foreignKeyConstraintName,
        name,
        referencedColumnName,
      }));

    expect(relation).toBeDefined();
    expect(joinColumns).toEqual([
      {
        foreignKeyConstraintName: 'FK_OUTBOX_CONSUMER_RECEIPT_EVENT',
        name: 'workspaceId',
        referencedColumnName: 'workspaceId',
      },
      {
        foreignKeyConstraintName: undefined,
        name: 'outboxEventId',
        referencedColumnName: 'id',
      },
    ]);
  });

  it('normalizes schema metadata without removing security constraints', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const queryRunner = { query } as unknown as QueryRunner;
    const command = new AlignIdealCrmSchemaMetadataFastInstanceCommand();

    await command.up(queryRunner);

    const upStatements = query.mock.calls.flat().join('\n');

    expect(upStatements).toContain(
      'ADD CONSTRAINT "FK_f2e084a39f3f522268ee3ecba84"',
    );
    expect(upStatements).not.toContain(
      'DROP CONSTRAINT "FK_OUTBOX_CONSUMER_RECEIPT_EVENT"',
    );
    expect(upStatements).not.toContain('CHK_METADATA_CHANGE_SET');

    query.mockClear();
    await command.down(queryRunner);

    const downStatements = query.mock.calls.flat().join('\n');

    expect(downStatements).toContain(
      'ADD CONSTRAINT "FK_OUTBOX_CONSUMER_RECEIPT_WORKSPACE"',
    );
    expect(downStatements).toContain(
      'ADD CONSTRAINT "FK_agent_action_approval_request_workspace"',
    );
  });
});
