import { STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { validateOperationIsPermittedOrThrow } from 'src/engine/twenty-orm/repository/permissions.utils';

const DASHBOARD_OBJECT_ID = '20202020-bbbb-4d02-bf25-6aeccf7ea419';

describe('validateOperationIsPermittedOrThrow system-object boundary', () => {
  it('denies a dashboard read when the role cannot read dashboard records', () => {
    expect(() =>
      validateOperationIsPermittedOrThrow({
        entityName: 'dashboard',
        operationType: 'select',
        objectsPermissions: {
          [DASHBOARD_OBJECT_ID]: {
            canReadObjectRecords: false,
            canUpdateObjectRecords: false,
            canSoftDeleteObjectRecords: false,
            canDestroyObjectRecords: false,
            restrictedFields: {},
            rowLevelPermissionPredicates: [],
            rowLevelPermissionPredicateGroups: [],
          },
        },
        flatObjectMetadataMaps: {
          byUniversalIdentifier: {
            [STANDARD_OBJECTS.dashboard.universalIdentifier]: {
              id: DASHBOARD_OBJECT_ID,
              universalIdentifier:
                STANDARD_OBJECTS.dashboard.universalIdentifier,
              nameSingular: 'dashboard',
              isSystem: true,
              fieldIds: [],
            },
          },
          universalIdentifierById: {
            [DASHBOARD_OBJECT_ID]:
              STANDARD_OBJECTS.dashboard.universalIdentifier,
          },
          universalIdentifiersByApplicationId: {},
        } as never,
        flatFieldMetadataMaps: {
          byUniversalIdentifier: {},
          universalIdentifierById: {},
          universalIdentifiersByApplicationId: {},
        },
        objectIdByNameSingular: { dashboard: DASHBOARD_OBJECT_ID },
        selectedColumns: '*',
        allFieldsSelected: true,
        updatedColumns: [],
      }),
    ).toThrow();
  });
});
