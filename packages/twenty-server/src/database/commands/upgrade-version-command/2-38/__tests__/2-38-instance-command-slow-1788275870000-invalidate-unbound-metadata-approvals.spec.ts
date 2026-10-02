import { type DataSource } from 'typeorm';

import { InvalidateUnboundMetadataApprovalsSlowInstanceCommand } from 'src/database/commands/upgrade-version-command/2-38/2-38-instance-command-slow-1788275870000-invalidate-unbound-metadata-approvals';

describe('InvalidateUnboundMetadataApprovalsSlowInstanceCommand', () => {
  it('invalidates only legacy approvals without a bound approval identity', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const dataSource = { query } as unknown as DataSource;

    await new InvalidateUnboundMetadataApprovalsSlowInstanceCommand().runDataMigration(
      dataSource,
    );

    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(
        /SET "state" = 'PLANNED',[\s\S]*WHERE "state" IN \('VALIDATED', 'APPROVED'\)[\s\S]*AND "approvalId" IS NULL/,
      ),
    );
  });
});
