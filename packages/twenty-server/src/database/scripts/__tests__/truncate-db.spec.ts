import { rawDataSource } from 'src/database/typeorm/raw/raw.datasource';

import { dropSchemasSequentially } from '../truncate-db';

jest.mock('src/database/typeorm/raw/raw.datasource', () => ({
  rawDataSource: {
    destroy: jest.fn(),
    initialize: jest.fn(),
    query: jest.fn(),
  },
}));

const mockedRawDataSource = rawDataSource as unknown as {
  destroy: jest.Mock;
  initialize: jest.Mock;
  query: jest.Mock;
};

describe('dropSchemasSequentially', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRawDataSource.initialize.mockResolvedValue(undefined);
    mockedRawDataSource.destroy.mockResolvedValue(undefined);
  });

  it('drops schemas one at a time and closes the connection', async () => {
    mockedRawDataSource.query
      .mockResolvedValueOnce([
        { schema_name: 'core' },
        { schema_name: 'workspace_"one' },
      ])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    await dropSchemasSequentially();

    expect(mockedRawDataSource.query).toHaveBeenNthCalledWith(
      2,
      'DROP SCHEMA IF EXISTS "core" CASCADE;',
    );
    expect(mockedRawDataSource.query).toHaveBeenNthCalledWith(
      3,
      'DROP SCHEMA IF EXISTS "workspace_""one" CASCADE;',
    );
    expect(mockedRawDataSource.destroy).toHaveBeenCalledTimes(1);
  });

  it('rejects on the first failed drop and does not report later drops', async () => {
    const dropError = new Error('out of shared memory');

    mockedRawDataSource.query
      .mockResolvedValueOnce([
        { schema_name: 'core' },
        { schema_name: 'workspace_one' },
      ])
      .mockRejectedValueOnce(dropError);

    await expect(dropSchemasSequentially()).rejects.toBe(dropError);

    expect(mockedRawDataSource.query).toHaveBeenCalledTimes(2);
    expect(mockedRawDataSource.destroy).toHaveBeenCalledTimes(1);
  });
});
