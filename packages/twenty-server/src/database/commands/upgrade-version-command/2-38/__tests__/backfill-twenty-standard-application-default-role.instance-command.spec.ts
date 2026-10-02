import { type DataSource } from 'typeorm';

import { BackfillTwentyStandardApplicationDefaultRoleSlowInstanceCommand } from 'src/database/commands/upgrade-version-command/2-38/2-38-instance-command-slow-1790863222346-backfill-twenty-standard-application-default-role';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';

describe('BackfillTwentyStandardApplicationDefaultRoleSlowInstanceCommand', () => {
  it('binds each standard application to its canonical admin role', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const dataSource = { query } as unknown as DataSource;
    const command =
      new BackfillTwentyStandardApplicationDefaultRoleSlowInstanceCommand();

    await command.runDataMigration(dataSource);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'AND "role"."workspaceId" = "application"."workspaceId"',
      ),
      [
        TWENTY_STANDARD_APPLICATION.universalIdentifier,
        STANDARD_ROLE.admin.universalIdentifier,
      ],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'AND "role"."applicationId" = "application"."id"',
      ),
      expect.any(Array),
    );
  });
});
