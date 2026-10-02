import { rawDataSource } from 'src/database/typeorm/raw/raw.datasource';

export async function dropSchemasSequentially() {
  await rawDataSource.initialize();

  try {
    const schemas = await rawDataSource.query<{ schema_name: string }[]>(`
      SELECT n.nspname AS "schema_name"
      FROM pg_catalog.pg_namespace n
      WHERE n.nspname !~ '^pg_'
        AND n.nspname <> 'information_schema'
        AND n.nspname NOT IN ('metric_helpers', 'user_management', 'public')
    `);

    for (const schema of schemas) {
      const escapedSchemaName = schema.schema_name.replace(/"/g, '""');

      await rawDataSource.query(
        `DROP SCHEMA IF EXISTS "${escapedSchemaName}" CASCADE;`,
      );
    }

    // oxlint-disable-next-line no-console
    console.log('All schemas dropped successfully.');
  } finally {
    await rawDataSource.destroy();
  }
}

if (require.main === module) {
  void dropSchemasSequentially().catch((error) => {
    // oxlint-disable-next-line no-console
    console.error('Error during schema dropping:', error);
    process.exitCode = 1;
  });
}
