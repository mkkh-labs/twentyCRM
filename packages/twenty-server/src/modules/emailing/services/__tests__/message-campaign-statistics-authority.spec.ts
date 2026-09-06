import { MessageCampaignStatisticsService } from 'src/modules/emailing/services/message-campaign-statistics.service';

const WORKSPACE_ID = '20202020-aaaa-4d02-bf25-6aeccf7ea419';
const CAMPAIGN_ID = '20202020-ffff-4d02-bf25-6aeccf7ea419';

describe('MessageCampaignStatisticsService authority', () => {
  it('opens statistics bypasses only inside an audited service mutation', async () => {
    const messageQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    const messageRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(messageQueryBuilder),
    };
    const campaignRepository = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const workspaceOrmManager = {
      executeInWorkspaceContext: jest
        .fn()
        .mockImplementation(async (callback) => callback()),
      getRepository: jest
        .fn()
        .mockReturnValueOnce(messageRepository)
        .mockReturnValueOnce(campaignRepository),
    };
    const emailingSystemPolicyService = {
      execute: jest.fn().mockImplementation(async ({ execute }) => execute()),
    };
    const service = new MessageCampaignStatisticsService(
      workspaceOrmManager as never,
      emailingSystemPolicyService as never,
    );

    await service.refreshCampaignCounts({
      workspaceId: WORKSPACE_ID,
      campaignId: CAMPAIGN_ID,
    });

    expect(emailingSystemPolicyService.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        operation: 'campaign.statistics.refresh',
        targetResourceId: CAMPAIGN_ID,
        actionArguments: { campaignId: CAMPAIGN_ID },
      }),
    );
    expect(workspaceOrmManager.getRepository).toHaveBeenCalledTimes(2);
  });
});
