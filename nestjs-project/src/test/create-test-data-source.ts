import { DataSource, EntitySchema, MigrationInterface } from 'typeorm';

interface TestDataSourceOptions {
  synchronize?: boolean;
  migrations?: (new () => MigrationInterface)[];
}

export function createTestDataSource(
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  entities: (Function | string | EntitySchema<any>)[],
  options: TestDataSourceOptions = {},
): DataSource {
  const { synchronize = true, migrations } = options;
  return new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST ?? 'db',
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USERNAME ?? 'streamtube',
    password: process.env.DB_PASSWORD ?? 'streamtube',
    database:
      process.env.DB_DATABASE_TEST ??
      process.env.DB_TEST_NAME ??
      (process.env.DB_DATABASE === 'streamtube'
        ? 'streamtube_test'
        : (process.env.DB_DATABASE ?? 'streamtube_test')),
    entities,
    synchronize,
    ...(migrations !== undefined && { migrations, migrationsRun: false }),
  });
}

export async function cleanAllTables(dataSource: DataSource): Promise<void> {
  const tables = [
    'videos',
    'refresh_tokens',
    'verification_tokens',
    'channels',
    'users',
  ];
  const existingTablesResult: { tablename: string }[] = await dataSource.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1)`,
    [tables],
  );
  if (existingTablesResult.length > 0) {
    const tableList = existingTablesResult
      .map((r) => `"${r.tablename}"`)
      .join(', ');
    await dataSource.query(`TRUNCATE TABLE ${tableList} CASCADE`);
  }
}
