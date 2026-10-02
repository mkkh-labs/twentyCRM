import { type CampaignJobAuthority } from 'src/engine/core-modules/emailing-domain/types/campaign-job-authority.type';

export type SendCampaignEmailJobData = CampaignJobAuthority & {
  workspaceId: string;
  campaignId: string;
  messageId: string;
  emailingDomainId: string;
};
