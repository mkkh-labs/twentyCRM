import { MODULE_METADATA } from '@nestjs/common/constants';

import { MetadataChangeSetModule } from 'src/engine/core-modules/metadata-change-set/metadata-change-set.module';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';

describe('MetadataChangeSetModule', () => {
  it('imports permissions required by its settings guard', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      MetadataChangeSetModule,
    ) as unknown[];

    expect(imports).toContain(PermissionsModule);
  });
});
