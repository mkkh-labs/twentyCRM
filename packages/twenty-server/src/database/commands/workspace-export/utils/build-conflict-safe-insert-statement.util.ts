import { buildInsertPrefix } from 'src/database/commands/workspace-export/utils/build-insert-prefix.util';
import { formatSqlValue } from 'src/database/commands/workspace-export/utils/format-sql-value.util';
import { escapeIdentifier } from 'src/engine/workspace-manager/workspace-migration/utils/remove-sql-injection.util';

type BuildConflictSafeInsertStatementOptions = {
  schemaName: string;
  tableName: string;
  columnNames: string[];
  rows: Record<string, unknown>[];
  conflictKeyColumns: string[];
  identityColumns: string[];
  jsonColumns?: Set<string>;
};

export const buildConflictSafeInsertStatement = ({
  schemaName,
  tableName,
  columnNames,
  rows,
  conflictKeyColumns,
  identityColumns,
  jsonColumns,
}: BuildConflictSafeInsertStatementOptions): string => {
  const comparisonColumns = [
    ...new Set([...conflictKeyColumns, ...identityColumns]),
  ];

  for (const columnName of comparisonColumns) {
    if (!columnNames.includes(columnName)) {
      throw new Error(
        `Conflict-safe insert column ${columnName} is missing from ${schemaName}.${tableName}`,
      );
    }
  }

  const comparisonTuples = rows.map(
    (row) =>
      `(${comparisonColumns
        .map((columnName) =>
          formatSqlValue(row[columnName], jsonColumns?.has(columnName)),
        )
        .join(', ')})`,
  );
  const valueTuples = rows.map(
    (row) =>
      `(${columnNames
        .map((columnName) =>
          formatSqlValue(row[columnName], jsonColumns?.has(columnName)),
        )
        .join(', ')})`,
  );
  const comparisonColumnProjection = comparisonColumns
    .map(escapeIdentifier)
    .join(', ');
  const conflictPredicate = conflictKeyColumns
    .map(
      (columnName) =>
        `existing.${escapeIdentifier(columnName)}::text = imported.${escapeIdentifier(columnName)}::text`,
    )
    .join(' AND ');
  const identityMismatchPredicate = identityColumns
    .map(
      (columnName) =>
        `existing.${escapeIdentifier(columnName)}::text IS DISTINCT FROM imported.${escapeIdentifier(columnName)}::text`,
    )
    .join(' OR ');
  const qualifiedTableName = `${escapeIdentifier(schemaName)}.${escapeIdentifier(tableName)}`;
  const conflictTarget = conflictKeyColumns.map(escapeIdentifier).join(', ');

  return `DO $twenty_portable_import$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (VALUES ${comparisonTuples.join(', ')}) AS imported (${comparisonColumnProjection})
    INNER JOIN ${qualifiedTableName} AS existing ON ${conflictPredicate}
    WHERE ${identityMismatchPredicate}
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Portable import identity conflict for ${schemaName}.${tableName}';
  END IF;
END
$twenty_portable_import$;
${buildInsertPrefix(schemaName, tableName, columnNames)}${valueTuples.join(', ')} ON CONFLICT (${conflictTarget}) DO NOTHING;\n`;
};
