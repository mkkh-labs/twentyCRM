import { type QueryRunner } from 'typeorm';

import { readWorkspacePostDataDdl } from 'src/database/commands/workspace-export/utils/read-workspace-post-data-ddl.util';

describe('readWorkspacePostDataDdl', () => {
  const query = jest.fn();
  const queryRunner = { query } as unknown as QueryRunner;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('recreates non-primary constraints and standalone indexes after data', async () => {
    query
      .mockResolvedValueOnce([
        {
          tableName: 'person',
          constraintName: 'FK_person_company',
          definition:
            'FOREIGN KEY ("companyId") REFERENCES workspace_test.company(id) ON DELETE SET NULL',
        },
      ])
      .mockResolvedValueOnce([
        {
          definition:
            'CREATE INDEX "IDX_person_name" ON workspace_test.person USING btree (name)',
        },
      ]);

    await expect(
      readWorkspacePostDataDdl({
        queryRunner,
        schemaName: 'workspace_test',
        tableNames: ['person'],
      }),
    ).resolves.toEqual([
      'ALTER TABLE "workspace_test"."person" ADD CONSTRAINT "FK_person_company" FOREIGN KEY ("companyId") REFERENCES workspace_test.company(id) ON DELETE SET NULL;',
      'CREATE INDEX "IDX_person_name" ON workspace_test.person USING btree (name);',
    ]);
  });

  it('binds the schema and requests deterministic catalog ordering', async () => {
    query.mockResolvedValue([]);

    await readWorkspacePostDataDdl({
      queryRunner,
      schemaName: 'workspace_test',
      tableNames: ['person'],
    });

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][1]).toEqual(['workspace_test', ['person']]);
    expect(query.mock.calls[0][1]).toEqual(['workspace_test', ['person']]);
    expect(query.mock.calls[0][0]).toContain(
      "constraint_record.contype <> 'p'",
    );
    expect(query.mock.calls[0][0]).toContain(
      'ORDER BY relation_record.relname, constraint_record.conname',
    );
    expect(query.mock.calls[0][0]).toContain(
      'relation_record.relname = ANY($2::text[])',
    );
    expect(query.mock.calls[0][0]).toContain(
      'referenced_relation_record.relname <> ALL($2::text[])',
    );
    expect(query.mock.calls[1][0]).toContain(
      'constraint_record.conindid = index_record.oid',
    );
    expect(query.mock.calls[1][0]).toContain(
      'ORDER BY table_record.relname, index_record.relname',
    );
    expect(query.mock.calls[1][0]).toContain(
      'table_record.relname = ANY($2::text[])',
    );
  });

  it('returns no DDL when the export contains no workspace tables', async () => {
    await expect(
      readWorkspacePostDataDdl({
        queryRunner,
        schemaName: 'workspace_test',
        tableNames: [],
      }),
    ).resolves.toEqual([]);

    expect(query).not.toHaveBeenCalled();
  });
});
