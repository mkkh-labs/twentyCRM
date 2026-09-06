import { z } from 'zod';

const campaignJobAuthoritySchema = {
  schemaVersion: z.literal(1),
  userWorkspaceId: z.uuid(),
  roleId: z.uuid(),
  rootCorrelationId: z.uuid(),
  parentPolicyDecisionId: z.uuid(),
};

export const materializeCampaignJobDataSchema = z.strictObject({
  ...campaignJobAuthoritySchema,
  workspaceId: z.uuid(),
  campaignId: z.uuid(),
  listId: z.uuid(),
  messageChannelId: z.uuid(),
  emailingDomainId: z.uuid(),
});

export const sendCampaignEmailJobDataSchema = z.strictObject({
  ...campaignJobAuthoritySchema,
  workspaceId: z.uuid(),
  campaignId: z.uuid(),
  messageId: z.uuid(),
  emailingDomainId: z.uuid(),
});
