import { type QueryRunner } from 'typeorm';

import { escapeIdentifier } from 'src/engine/workspace-manager/workspace-migration/utils/remove-sql-injection.util';

type PhysicalConstraint = {
  tableName: string;
  constraintName: string;
  definition: string;
};

type PhysicalIndex = {
  definition: string;
};

export const readWorkspacePostDataDdl = async ({
  queryRunner,
  schemaName,
  tableNames,
}: {
  queryRunner: QueryRunner;
  schemaName: string;
  tableNames: string[];
}): Promise<string[]> => {
  if (tableNames.length === 0) {
    return [];
  }

  const constraints: PhysicalConstraint[] = await queryRunner.query(
    `SELECT
      relation_record.relname AS "tableName",
      constraint_record.conname AS "constraintName",
      pg_get_constraintdef(constraint_record.oid, false) AS "definition"
    FROM pg_constraint constraint_record
    JOIN pg_class relation_record
      ON relation_record.oid = constraint_record.conrelid
    JOIN pg_namespace namespace_record
      ON namespace_record.oid = relation_record.relnamespace
    WHERE namespace_record.nspname = $1
      AND relation_record.relname = ANY($2::text[])
      AND constraint_record.contype <> 'p'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_class referenced_relation_record
        JOIN pg_namespace referenced_namespace_record
          ON referenced_namespace_record.oid = referenced_relation_record.relnamespace
        WHERE referenced_relation_record.oid = constraint_record.confrelid
          AND referenced_namespace_record.nspname = $1
          AND referenced_relation_record.relname <> ALL($2::text[])
      )
    ORDER BY relation_record.relname, constraint_record.conname`,
    [schemaName, tableNames],
  );

  const indexes: PhysicalIndex[] = await queryRunner.query(
    `SELECT pg_get_indexdef(index_record.oid) AS "definition"
    FROM pg_class index_record
    JOIN pg_index physical_index
      ON physical_index.indexrelid = index_record.oid
    JOIN pg_class table_record
      ON table_record.oid = physical_index.indrelid
    JOIN pg_namespace namespace_record
      ON namespace_record.oid = table_record.relnamespace
    WHERE namespace_record.nspname = $1
      AND table_record.relname = ANY($2::text[])
      AND physical_index.indisvalid
      AND NOT EXISTS (
        SELECT 1
        FROM pg_constraint constraint_record
        WHERE constraint_record.conindid = index_record.oid
      )
    ORDER BY table_record.relname, index_record.relname`,
    [schemaName, tableNames],
  );

  return [
    ...constraints.map(
      ({ tableName, constraintName, definition }) =>
        `ALTER TABLE ${escapeIdentifier(schemaName)}.${escapeIdentifier(tableName)} ADD CONSTRAINT ${escapeIdentifier(constraintName)} ${definition};`,
    ),
    ...indexes.map(({ definition }) => `${definition};`),
  ];
};
