import { UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';
import { FeatureFlagKey } from 'twenty-shared/types';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { CampaignAudiencePreviewDTO } from 'src/engine/core-modules/emailing-domain/dtos/campaign-audience-preview.dto';
import { EmailGroupAccessGraphqlApiExceptionFilter } from 'src/engine/core-modules/emailing-domain/filters/email-group-access-graphql-api-exception.filter';
import { EmailingDomainGraphqlApiExceptionFilter } from 'src/engine/core-modules/emailing-domain/filters/emailing-domain-graphql-api-exception.filter';
import { PreviewMessageCampaignAudienceInput } from 'src/engine/core-modules/emailing-domain/dtos/preview-message-campaign-audience.input';
import { SendEmailViaDomainInput } from 'src/engine/core-modules/emailing-domain/dtos/send-email-via-domain.input';
import { SendEmailViaDomainOutputDTO } from 'src/engine/core-modules/emailing-domain/dtos/send-email-via-domain-output.dto';
import { SendMessageCampaignInput } from 'src/engine/core-modules/emailing-domain/dtos/send-message-campaign.input';
import { SendMessageCampaignTestInput } from 'src/engine/core-modules/emailing-domain/dtos/send-message-campaign-test.input';
import { SendMessageCampaignOutputDTO } from 'src/engine/core-modules/emailing-domain/dtos/send-message-campaign-output.dto';
import { EmailGroupAccessService } from 'src/engine/core-modules/emailing-domain/services/email-group-access.service';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import {
  FeatureFlagGuard,
  RequireFeatureFlag,
} from 'src/engine/guards/feature-flag.guard';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { EmailBillingService } from 'src/modules/emailing/services/email-billing.service';
import { EmailingDomainSenderService } from 'src/modules/emailing/services/emailing-domain-sender.service';
import { MessageCampaignService } from 'src/modules/emailing/services/message-campaign.service';
import { MessageCampaignPolicyService } from 'src/modules/emailing/services/message-campaign-policy.service';

@UseGuards(
  WorkspaceAuthGuard,
  FeatureFlagGuard,
  SettingsPermissionGuard(PermissionFlagType.WORKSPACE),
)
@UseFilters(
  EmailGroupAccessGraphqlApiExceptionFilter,
  EmailingDomainGraphqlApiExceptionFilter,
)
@UsePipes(ResolverValidationPipe)
@MetadataResolver()
export class EmailingSendResolver {
  constructor(
    private readonly emailingDomainSenderService: EmailingDomainSenderService,
    private readonly messageCampaignService: MessageCampaignService,
    private readonly emailGroupAccessService: EmailGroupAccessService,
    private readonly emailBillingService: EmailBillingService,
    private readonly messageCampaignPolicyService: MessageCampaignPolicyService,
  ) {}

  @Mutation(() => SendEmailViaDomainOutputDTO)
  @RequireFeatureFlag(FeatureFlagKey.IS_EMAIL_GROUP_ENABLED)
  async sendEmailViaEmailingDomain(
    @Args('input') input: SendEmailViaDomainInput,
    @AuthWorkspace() currentWorkspace: WorkspaceEntity,
  ): Promise<SendEmailViaDomainOutputDTO> {
    this.emailGroupAccessService.validateEmailGroupAccessOrThrow();
    await this.emailBillingService.validateEmailCreditsOrThrow(
      currentWorkspace.id,
    );

    const { emailingDomainId, ...content } = input;
    const { value } = await this.messageCampaignPolicyService.execute({
      authContext: getWorkspaceAuthContext(),
      workspaceId: currentWorkspace.id,
      operation: 'email.send.direct',
      riskClass: 'R2',
      targetResourceType: 'emailingDomain',
      targetResourceId: emailingDomainId,
      actionArguments: { ...input },
      execute: async () => {
        const result = await this.emailingDomainSenderService.sendEmail(
          currentWorkspace.id,
          emailingDomainId,
          content,
        );

        await this.emailBillingService.billSentEmails({
          workspaceId: currentWorkspace.id,
          sentEmailCount: 1,
        });

        return result;
      },
      getProviderReference: (result) => result.messageId,
    });

    return { messageId: value.messageId };
  }

  @Mutation(() => SendMessageCampaignOutputDTO)
  @RequireFeatureFlag(FeatureFlagKey.IS_EMAIL_GROUP_ENABLED)
  async sendMessageCampaign(
    @Args('input') input: SendMessageCampaignInput,
    @AuthWorkspace() currentWorkspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ): Promise<SendMessageCampaignOutputDTO> {
    this.emailGroupAccessService.validateEmailGroupAccessOrThrow();
    await this.emailBillingService.validateEmailCreditsOrThrow(
      currentWorkspace.id,
    );

    return this.messageCampaignService.send({
      workspaceId: currentWorkspace.id,
      userWorkspaceId,
      campaignId: input.campaignId,
    });
  }

  @Mutation(() => SendEmailViaDomainOutputDTO)
  @RequireFeatureFlag(FeatureFlagKey.IS_EMAIL_GROUP_ENABLED)
  async sendMessageCampaignTest(
    @Args('input') input: SendMessageCampaignTestInput,
    @AuthWorkspace() currentWorkspace: WorkspaceEntity,
  ): Promise<SendEmailViaDomainOutputDTO> {
    this.emailGroupAccessService.validateEmailGroupAccessOrThrow();
    await this.emailBillingService.validateEmailCreditsOrThrow(
      currentWorkspace.id,
    );

    const { value } = await this.messageCampaignPolicyService.execute({
      authContext: getWorkspaceAuthContext(),
      workspaceId: currentWorkspace.id,
      operation: 'campaign.test.send',
      riskClass: 'R2',
      targetResourceType: 'messageCampaignTest',
      actionArguments: { ...input },
      execute: () =>
        this.messageCampaignService.sendTest({
          workspaceId: currentWorkspace.id,
          toAddress: input.toAddress,
          unsubscribeTopicId: input.unsubscribeTopicId,
          subject: input.subject,
          html: input.body,
          fromAddress: input.fromAddress,
        }),
      getProviderReference: (result) => result.messageId,
    });

    return { messageId: value.messageId };
  }

  @Query(() => CampaignAudiencePreviewDTO)
  @RequireFeatureFlag(FeatureFlagKey.IS_EMAIL_GROUP_ENABLED)
  async previewMessageCampaignAudience(
    @Args('input') input: PreviewMessageCampaignAudienceInput,
    @AuthWorkspace() currentWorkspace: WorkspaceEntity,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ): Promise<CampaignAudiencePreviewDTO> {
    this.emailGroupAccessService.validateEmailGroupAccessOrThrow();

    return this.messageCampaignService.previewAudience({
      workspaceId: currentWorkspace.id,
      userWorkspaceId,
      listId: input.listId,
      unsubscribeTopicId: input.unsubscribeTopicId,
    });
  }
}
