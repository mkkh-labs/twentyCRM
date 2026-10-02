jest.mock('src/database/typeorm/raw/raw.datasource', () => ({
  rawDataSource: { query: jest.fn() },
}));

import { rawDataSource } from 'src/database/typeorm/raw/raw.datasource';
import { performQuery } from 'src/database/scripts/setup-db-utils';

const mockQuery = jest.mocked(rawDataSource.query);

describe('performQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('propagates database failures', async () => {
    const databaseError = new Error('permission denied');

    mockQuery.mockRejectedValue(databaseError);

    await expect(
      performQuery('CREATE EXTENSION unavailable', 'create extension'),
    ).rejects.toBe(databaseError);
  });

  it('ignores only an explicitly allowed already-exists failure', async () => {
    mockQuery.mockRejectedValue(new Error('object already exists'));

    await expect(
      performQuery('CREATE THING', 'create thing', false, true),
    ).resolves.toBeUndefined();
  });
});
