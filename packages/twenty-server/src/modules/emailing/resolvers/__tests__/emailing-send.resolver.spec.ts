import { withWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { EmailingSendResolver } from 'src/modules/emailing/resolvers/emailing-send.resolver';

const WORKSPACE_ID = '20202020-aaaa-4d02-bf25-6aeccf7ea419';
const USER_WORKSPACE_ID = '20202020-bbbb-4d02-bf25-6aeccf7ea419';
const EMAILING_DOMAIN_ID = '20202020-cccc-4d02-bf25-6aeccf7ea419';

const authContext = {
  type: 'user',
  workspace: { id: WORKSPACE_ID, metadataVersion: 7 },
  user: { id: '20202020-dddd-4d02-bf25-6aeccf7ea419' },
  workspaceMemberId: '20202020-eeee-4d02-bf25-6aeccf7ea419',
  userWorkspaceId: USER_WORKSPACE_ID,
} as unknown as UserWorkspaceAuthContext;

describe('EmailingSendResolver protected effects', () => {
  const buildResolver = () => {
    const emailingDomainSenderService = {
      sendEmail: jest.fn().mockResolvedValue({
        messageId: 'provider-message-id',
        deliveredRecipients: {
          to: ['recipient@example.com'],
          cc: [],
          bcc: [],
        },
      }),
    };
    const emailBillingService = {
      validateEmailCreditsOrThrow: jest.fn().mockResolvedValue(undefined),
      billSentEmails: jest.fn().mockResolvedValue(undefined),
    };
    const messageCampaignService = {
      sendTest: jest.fn().mockResolvedValue({
        messageId: 'campaign-test-provider-message-id',
        deliveredRecipients: {
          to: ['recipient@example.com'],
          cc: [],
          bcc: [],
        },
      }),
    };
    const messageCampaignPolicyService = {
      execute: jest.fn().mockImplementation(async ({ execute }) => ({
        value: await execute({
          rootCorrelationId: '20202020-1111-4d02-bf25-6aeccf7ea419',
          policyDecisionId: '20202020-2222-4d02-bf25-6aeccf7ea419',
        }),
        rootCorrelationId: '20202020-1111-4d02-bf25-6aeccf7ea419',
        policyDecisionId: '20202020-2222-4d02-bf25-6aeccf7ea419',
      })),
    };
    const resolver = new EmailingSendResolver(
      emailingDomainSenderService as never,
      messageCampaignService as never,
      { validateEmailGroupAccessOrThrow: jest.fn() } as never,
      emailBillingService as never,
      messageCampaignPolicyService as never,
    );

    return {
      emailingDomainSenderService,
      emailBillingService,
      messageCampaignService,
      messageCampaignPolicyService,
      resolver,
    };
  };

  it('orders a direct email behind a bound R2 policy operation', async () => {
    const {
      emailingDomainSenderService,
      emailBillingService,
      messageCampaignPolicyService,
      resolver,
    } = buildResolver();
    const input = {
      emailingDomainId: EMAILING_DOMAIN_ID,
      from: 'sender@example.com',
      to: ['recipient@example.com'],
      subject: 'Subject',
      text: 'Sensitive body',
    };

    await expect(
      withWorkspaceAuthContext(authContext, () =>
        resolver.sendEmailViaEmailingDomain(
          input,
          authContext.workspace as unknown as WorkspaceEntity,
        ),
      ),
    ).resolves.toEqual({ messageId: 'provider-message-id' });

    expect(messageCampaignPolicyService.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        authContext,
        workspaceId: WORKSPACE_ID,
        operation: 'email.send.direct',
        riskClass: 'R2',
        targetResourceType: 'emailingDomain',
        targetResourceId: EMAILING_DOMAIN_ID,
        actionArguments: input,
        getProviderReference: expect.any(Function),
      }),
    );
    expect(emailingDomainSenderService.sendEmail).toHaveBeenCalledTimes(1);
    expect(emailBillingService.billSentEmails).toHaveBeenCalledTimes(1);
  });

  it('orders a campaign test email behind a bound R2 policy operation', async () => {
    const { messageCampaignPolicyService, messageCampaignService, resolver } =
      buildResolver();
    const input = {
      toAddress: 'recipient@example.com',
      subject: 'Subject',
      body: 'Sensitive body',
      fromAddress: 'sender@example.com',
    };

    await expect(
      withWorkspaceAuthContext(authContext, () =>
        resolver.sendMessageCampaignTest(
          input,
          authContext.workspace as unknown as WorkspaceEntity,
        ),
      ),
    ).resolves.toEqual({ messageId: 'campaign-test-provider-message-id' });

    expect(messageCampaignPolicyService.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        authContext,
        workspaceId: WORKSPACE_ID,
        operation: 'campaign.test.send',
        riskClass: 'R2',
        targetResourceType: 'messageCampaignTest',
        actionArguments: input,
        getProviderReference: expect.any(Function),
      }),
    );
    expect(messageCampaignService.sendTest).toHaveBeenCalledTimes(1);
  });
});
