import { buildConflictSafeInsertStatement } from 'src/database/commands/workspace-export/utils/build-conflict-safe-insert-statement.util';

describe('buildConflictSafeInsertStatement', () => {
  it('reuses an existing row only when its identity columns match', () => {
    const statement = buildConflictSafeInsertStatement({
      schemaName: 'core',
      tableName: 'user',
      columnNames: ['id', 'email', 'firstName'],
      rows: [
        {
          id: '20202020-a87c-4fde-8e38-1fdcb0b701ca',
          email: 'admin@example.com',
          firstName: 'Admin',
        },
      ],
      conflictKeyColumns: ['id'],
      identityColumns: ['email'],
    });

    expect(statement).toContain('existing."id"::text = imported."id"::text');
    expect(statement).toContain(
      'existing."email"::text IS DISTINCT FROM imported."email"::text',
    );
    expect(statement).toContain(
      "MESSAGE = 'Portable import identity conflict for core.user'",
    );
    expect(statement).toContain('ON CONFLICT ("id") DO NOTHING;');
  });

  it('rejects identity or conflict columns absent from the insert projection', () => {
    expect(() =>
      buildConflictSafeInsertStatement({
        schemaName: 'core',
        tableName: 'user',
        columnNames: ['id'],
        rows: [{ id: '20202020-a87c-4fde-8e38-1fdcb0b701ca' }],
        conflictKeyColumns: ['id'],
        identityColumns: ['email'],
      }),
    ).toThrow('Conflict-safe insert column email is missing');
  });
});
