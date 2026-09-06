import { CAMPAIGN_MESSAGE_DELIVERY_STATUS } from 'src/engine/core-modules/emailing-domain/constants/campaign.constant';
import { MessageCampaignService } from 'src/modules/emailing/services/message-campaign.service';

const WORKSPACE_ID = '20202020-aaaa-4d02-bf25-6aeccf7ea419';
const CAMPAIGN_ID = '20202020-ffff-4d02-bf25-6aeccf7ea419';
const MESSAGE_ID = '20202020-bbbb-4d02-bf25-6aeccf7ea419';

describe('MessageCampaignService system authority', () => {
  it('opens the delivery-status bypass only inside an audited service mutation', async () => {
    const messageRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: MESSAGE_ID,
        messageCampaignId: CAMPAIGN_ID,
        deliveryStatus: CAMPAIGN_MESSAGE_DELIVERY_STATUS.SENT,
      }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const workspaceOrmManager = {
      executeInWorkspaceContext: jest
        .fn()
        .mockImplementation(async (callback) => callback()),
      getRepository: jest.fn().mockReturnValue(messageRepository),
    };
    const emailingSystemPolicyService = {
      execute: jest.fn().mockImplementation(async ({ execute }) => execute()),
    };
    const service = Reflect.construct(MessageCampaignService, [
      {},
      {},
      workspaceOrmManager,
      { add: jest.fn().mockResolvedValue(undefined) },
      {},
      {},
      {},
      {},
      {},
      {},
      { acquireLock: jest.fn().mockResolvedValue(false) },
      {},
      {},
      {},
      {},
      {},
      emailingSystemPolicyService,
    ]) as MessageCampaignService;

    await service.recordDeliveryFailureByProviderMessageId({
      workspaceId: WORKSPACE_ID,
      providerMessageId: 'provider-message-id',
      deliveryStatus: CAMPAIGN_MESSAGE_DELIVERY_STATUS.BOUNCED,
    });

    expect(emailingSystemPolicyService.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        operation: 'campaign.delivery-status.update',
        actionArguments: {
          deliveryStatus: CAMPAIGN_MESSAGE_DELIVERY_STATUS.BOUNCED,
          providerMessageIdDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
      }),
    );
    expect(workspaceOrmManager.getRepository).toHaveBeenCalledWith(
      expect.any(Function),
      { shouldBypassPermissionChecks: true },
    );
  });
});
