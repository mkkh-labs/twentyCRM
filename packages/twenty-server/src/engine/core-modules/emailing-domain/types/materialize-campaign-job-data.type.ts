import { type CampaignJobAuthority } from 'src/engine/core-modules/emailing-domain/types/campaign-job-authority.type';

export type MaterializeCampaignJobData = CampaignJobAuthority & {
  workspaceId: string;
  campaignId: string;
  listId: string;
  messageChannelId: string;
  emailingDomainId: string;
};
