import { type DataSource, type EntityMetadata } from 'typeorm';

import { getCoreEntityMetadatasWithWorkspaceId } from 'src/database/commands/workspace-export/utils/get-core-entity-metadatas-with-workspace-id.util';

describe('getCoreEntityMetadatasWithWorkspaceId', () => {
  it('includes aliased entity properties backed by the workspaceId column', () => {
    const directWorkspaceEntity = {
      tableName: 'application',
      columns: [{ propertyName: 'workspaceId', databaseName: 'workspaceId' }],
    } as unknown as EntityMetadata;
    const aliasedWorkspaceEntity = {
      tableName: 'applicationRegistration',
      columns: [
        { propertyName: 'ownerWorkspaceId', databaseName: 'workspaceId' },
      ],
    } as unknown as EntityMetadata;
    const globalEntity = {
      tableName: 'user',
      columns: [{ propertyName: 'id', databaseName: 'id' }],
    } as unknown as EntityMetadata;
    const dataSource = {
      entityMetadatas: [
        directWorkspaceEntity,
        aliasedWorkspaceEntity,
        globalEntity,
      ],
    } as DataSource;

    expect(getCoreEntityMetadatasWithWorkspaceId(dataSource)).toEqual([
      directWorkspaceEntity,
      aliasedWorkspaceEntity,
    ]);
  });
});
