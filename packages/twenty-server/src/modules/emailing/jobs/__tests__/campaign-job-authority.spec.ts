import {
  MATERIALIZE_CAMPAIGN_JOB,
  SEND_CAMPAIGN_EMAIL_JOB,
} from 'src/engine/core-modules/emailing-domain/constants/campaign.constant';
import { type MaterializeCampaignJobData } from 'src/engine/core-modules/emailing-domain/types/materialize-campaign-job-data.type';
import { type SendCampaignEmailJobData } from 'src/engine/core-modules/emailing-domain/types/send-campaign-email-job-data.type';
import { type MessageQueueJobContext } from 'src/engine/core-modules/message-queue/interfaces/message-queue-job.interface';
import { MaterializeCampaignJob } from 'src/modules/emailing/jobs/materialize-campaign.job';
import { SendCampaignEmailJob } from 'src/modules/emailing/jobs/send-campaign-email.job';
import { type MessageCampaignService } from 'src/modules/emailing/services/message-campaign.service';

const WORKSPACE_ID = '20202020-aaaa-4d02-bf25-6aeccf7ea419';
const CAMPAIGN_ID = '20202020-bbbb-4d02-bf25-6aeccf7ea419';
const USER_WORKSPACE_ID = '20202020-3333-4d02-bf25-6aeccf7ea419';
const ROLE_ID = '20202020-4444-4d02-bf25-6aeccf7ea419';
const ROOT_CORRELATION_ID = '20202020-5555-4d02-bf25-6aeccf7ea419';
const PARENT_POLICY_DECISION_ID = '20202020-9999-4d02-bf25-6aeccf7ea419';

const buildJobContext = (jobName: string): MessageQueueJobContext => ({
  jobId: '20202020-cccc-4d02-bf25-6aeccf7ea419',
  jobName,
});

describe('campaign job authority envelope', () => {
  it('forwards a policy-bound materialize job', async () => {
    const messageCampaignService = {
      processMaterializeJob: jest.fn().mockResolvedValue(undefined),
    };
    const job = new MaterializeCampaignJob(
      messageCampaignService as unknown as MessageCampaignService,
    );
    const data = {
      schemaVersion: 1,
      workspaceId: WORKSPACE_ID,
      userWorkspaceId: USER_WORKSPACE_ID,
      roleId: ROLE_ID,
      rootCorrelationId: ROOT_CORRELATION_ID,
      parentPolicyDecisionId: PARENT_POLICY_DECISION_ID,
      campaignId: CAMPAIGN_ID,
      listId: '20202020-6666-4d02-bf25-6aeccf7ea419',
      messageChannelId: '20202020-7777-4d02-bf25-6aeccf7ea419',
      emailingDomainId: '20202020-8888-4d02-bf25-6aeccf7ea419',
    } as const;

    await expect(
      job.handle(data, buildJobContext(MATERIALIZE_CAMPAIGN_JOB)),
    ).resolves.toBeUndefined();
    expect(messageCampaignService.processMaterializeJob).toHaveBeenCalledWith(
      data,
    );
  });

  it('denies a legacy materialize job before campaign processing', async () => {
    const messageCampaignService = {
      processMaterializeJob: jest.fn().mockResolvedValue(undefined),
    };
    const job = new MaterializeCampaignJob(
      messageCampaignService as unknown as MessageCampaignService,
    );
    const legacyData = {
      workspaceId: WORKSPACE_ID,
      campaignId: CAMPAIGN_ID,
      messageChannelId: '20202020-dddd-4d02-bf25-6aeccf7ea419',
      emailingDomainId: '20202020-eeee-4d02-bf25-6aeccf7ea419',
      recipients: [],
    } as unknown as MaterializeCampaignJobData;

    await expect(
      job.handle(legacyData, buildJobContext(MATERIALIZE_CAMPAIGN_JOB)),
    ).rejects.toThrow('Campaign job authority is missing or invalid');
    expect(messageCampaignService.processMaterializeJob).not.toHaveBeenCalled();
  });

  it('denies a legacy send job before campaign processing', async () => {
    const messageCampaignService = {
      processSendJob: jest.fn().mockResolvedValue(undefined),
    };
    const job = new SendCampaignEmailJob(
      messageCampaignService as unknown as MessageCampaignService,
    );
    const legacyData = {
      workspaceId: WORKSPACE_ID,
      campaignId: CAMPAIGN_ID,
      messageId: '20202020-ffff-4d02-bf25-6aeccf7ea419',
      personId: '20202020-1111-4d02-bf25-6aeccf7ea419',
      recipientEmail: 'recipient@example.com',
      emailingDomainId: '20202020-2222-4d02-bf25-6aeccf7ea419',
    } as unknown as SendCampaignEmailJobData;

    await expect(job.handle(legacyData)).rejects.toThrow(
      'Campaign job authority is missing or invalid',
    );
    expect(messageCampaignService.processSendJob).not.toHaveBeenCalled();
  });

  it('denies hidden recipient data in a materialize payload', async () => {
    const messageCampaignService = {
      processMaterializeJob: jest.fn().mockResolvedValue(undefined),
    };
    const job = new MaterializeCampaignJob(
      messageCampaignService as unknown as MessageCampaignService,
    );
    const data = {
      schemaVersion: 1,
      workspaceId: WORKSPACE_ID,
      userWorkspaceId: USER_WORKSPACE_ID,
      roleId: ROLE_ID,
      rootCorrelationId: ROOT_CORRELATION_ID,
      campaignId: CAMPAIGN_ID,
      listId: '20202020-6666-4d02-bf25-6aeccf7ea419',
      messageChannelId: '20202020-7777-4d02-bf25-6aeccf7ea419',
      emailingDomainId: '20202020-8888-4d02-bf25-6aeccf7ea419',
      recipients: [{ personId: 'person-id', email: 'hidden@example.com' }],
    } as unknown as MaterializeCampaignJobData;

    await expect(
      job.handle(data, buildJobContext(MATERIALIZE_CAMPAIGN_JOB)),
    ).rejects.toThrow('Campaign job authority is missing or invalid');
    expect(messageCampaignService.processMaterializeJob).not.toHaveBeenCalled();
  });

  it('denies hidden recipient data in a send payload', async () => {
    const messageCampaignService = {
      processSendJob: jest.fn().mockResolvedValue(undefined),
    };
    const job = new SendCampaignEmailJob(
      messageCampaignService as unknown as MessageCampaignService,
    );
    const data = {
      schemaVersion: 1,
      workspaceId: WORKSPACE_ID,
      userWorkspaceId: USER_WORKSPACE_ID,
      roleId: ROLE_ID,
      rootCorrelationId: ROOT_CORRELATION_ID,
      campaignId: CAMPAIGN_ID,
      messageId: '20202020-9999-4d02-bf25-6aeccf7ea419',
      emailingDomainId: '20202020-1111-4d02-bf25-6aeccf7ea419',
      recipientEmail: 'hidden@example.com',
    } as unknown as SendCampaignEmailJobData;

    await expect(
      job.handle(data, buildJobContext(SEND_CAMPAIGN_EMAIL_JOB)),
    ).rejects.toThrow('Campaign job authority is missing or invalid');
    expect(messageCampaignService.processSendJob).not.toHaveBeenCalled();
  });
});
