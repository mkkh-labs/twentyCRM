import { Injectable, Logger, type Type } from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';
import { z } from 'zod';
import { In, type ObjectLiteral } from 'typeorm';
import { v4, v5 } from 'uuid';

import {
  CAMPAIGN_MESSAGE_DELIVERY_STATUS,
  CAMPAIGN_MESSAGE_ID_NAMESPACE,
  CAMPAIGN_STATS_REFRESH_DELAY_MS,
  MATERIALIZE_CAMPAIGN_JOB,
  MAX_CAMPAIGN_RECIPIENTS,
  REFRESH_CAMPAIGN_STATS_JOB,
  SEND_CAMPAIGN_EMAIL_JOB,
} from 'src/engine/core-modules/emailing-domain/constants/campaign.constant';
import {
  EmailingDomainDriverException,
  EmailingDomainDriverExceptionCode,
} from 'src/engine/core-modules/emailing-domain/drivers/exceptions/emailing-domain-driver.exception';
import { EmailingDomainStatus } from 'src/engine/core-modules/emailing-domain/drivers/types/emailing-domain-status.type';
import {
  EmailingDomainException,
  EmailingDomainExceptionCode,
} from 'src/engine/core-modules/emailing-domain/exceptions/emailing-domain.exception';
import { type EmailingDomainSendEmailResult } from 'src/engine/core-modules/emailing-domain/drivers/types/emailing-domain-send-email-result.type';
import { EmailingDomainEntity } from 'src/engine/core-modules/emailing-domain/emailing-domain.entity';
import { type CampaignRecipient } from 'src/engine/core-modules/emailing-domain/types/campaign-recipient.type';
import { type CampaignSkippedBreakdown } from 'src/engine/core-modules/emailing-domain/types/campaign-skipped-breakdown.type';
import { type MaterializeCampaignJobData } from 'src/engine/core-modules/emailing-domain/types/materialize-campaign-job-data.type';
import { type RawCampaignRecipient } from 'src/engine/core-modules/emailing-domain/types/raw-campaign-recipient.type';
import { type RefreshCampaignStatsJobData } from 'src/engine/core-modules/emailing-domain/types/refresh-campaign-stats-job-data.type';
import { type SendCampaignEmailJobData } from 'src/engine/core-modules/emailing-domain/types/send-campaign-email-job-data.type';
import { normalizeCampaignRecipients } from 'src/engine/core-modules/emailing-domain/utils/normalize-campaign-recipients.util';
import { InjectCacheStorage } from 'src/engine/core-modules/cache-storage/decorators/cache-storage.decorator';
import { CacheStorageService } from 'src/engine/core-modules/cache-storage/services/cache-storage.service';
import { CacheStorageNamespace } from 'src/engine/core-modules/cache-storage/types/cache-storage-namespace.enum';
import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { buildUserAuthContext } from 'src/engine/core-modules/auth/utils/build-user-auth-context.util';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { buildDeterministicDigest } from 'src/engine/core-modules/policy/utils/build-deterministic-digest.util';
import { UserWorkspaceService } from 'src/engine/core-modules/user-workspace/user-workspace.service';
import { fromUserEntityToFlat } from 'src/engine/core-modules/user/utils/from-user-entity-to-flat.util';
import { fromWorkspaceEntityToFlat } from 'src/engine/core-modules/workspace/utils/from-workspace-entity-to-flat.util';
import { MessageChannelMetadataService } from 'src/engine/metadata-modules/message-channel/message-channel-metadata.service';
import { UserRoleService } from 'src/engine/metadata-modules/user-role/user-role.service';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { WorkflowEffectService } from 'src/engine/core-modules/workflow-reliability/services/workflow-effect.service';
import { WorkflowProviderCapabilityRegistryService } from 'src/engine/core-modules/workflow-reliability/services/workflow-provider-capability-registry.service';
import { CampaignVariableService } from 'src/modules/emailing/services/campaign-variable.service';
import { EmailBillingService } from 'src/modules/emailing/services/email-billing.service';
import { EmailingDomainSenderService } from 'src/modules/emailing/services/emailing-domain-sender.service';
import { EmailingSystemPolicyService } from 'src/modules/emailing/services/emailing-system-policy.service';
import {
  CampaignPolicyReconciliationRequiredError,
  MessageCampaignPolicyService,
} from 'src/modules/emailing/services/message-campaign-policy.service';
import { MessageCampaignStatisticsService } from 'src/modules/emailing/services/message-campaign-statistics.service';
import { MessageSuppressionService } from 'src/modules/emailing/services/message-suppression.service';
import { MessageCampaignWorkspaceEntity } from 'src/modules/emailing/standard-objects/message-campaign.workspace-entity';
import { MessageListMemberWorkspaceEntity } from 'src/modules/emailing/standard-objects/message-list-member.workspace-entity';
import { collectCampaignVariableNamesFromTemplates } from 'src/modules/emailing/utils/collect-campaign-variable-names-from-templates.util';
import { compileCampaignEmailContent } from 'src/modules/emailing/utils/compile-campaign-email-content.util';
import { renderCampaignTemplate } from 'src/modules/emailing/utils/render-campaign-template.util';
import { sendableDraftCampaignSchema } from 'src/modules/emailing/zod-schemas/sendable-draft-campaign.zod-schema';
import { MessageDirection } from 'src/modules/messaging/common/enums/message-direction.enum';
import { MessageChannelMessageAssociationWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-channel-message-association.workspace-entity';
import { MessageParticipantWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-participant.workspace-entity';
import { MessageThreadWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message-thread.workspace-entity';
import { MessageWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message.workspace-entity';
import { PersonWorkspaceEntity } from 'src/modules/person/standard-objects/person.workspace-entity';
import {
  MessageParticipantRole,
  MessageCampaignStatus,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { getDomainFromEmail } from 'src/utils/get-domain-from-email';

type SendCampaignArgs = {
  workspaceId: string;
  userWorkspaceId: string;
  campaignId: string;
};

type SendCampaignTestArgs = {
  workspaceId: string;
  toAddress: string;
  subject: string;
  html: string;
  fromAddress: string;
  unsubscribeTopicId?: string;
};

type SendCampaignResult = {
  campaignId: string;
  queuedCount: number;
  skipped: CampaignSkippedBreakdown;
};

type CampaignAudiencePreview = {
  totalMembers: number;
  withoutEmail: number;
  duplicateEmails: number;
  globallyUnsubscribed: number;
  topicUnsubscribed: number;
  sendable: number;
};

type CampaignMessageRecipient = CampaignRecipient & { messageId: string };

type SendableDraftCampaign = z.infer<typeof sendableDraftCampaignSchema>;

class CampaignEffectRequiresReconciliationError extends Error {}
class CampaignEffectTerminalFailureError extends Error {}

const toRawRecipient = (person: {
  id: string;
  emails?: { primaryEmail?: string | null } | null;
}): RawCampaignRecipient => ({
  personId: person.id,
  email: person.emails?.primaryEmail ?? null,
});

@Injectable()
export class MessageCampaignService {
  private readonly logger = new Logger(MessageCampaignService.name);
  constructor(
    @InjectWorkspaceScopedRepository(EmailingDomainEntity)
    private readonly emailingDomainRepository: WorkspaceScopedRepository<EmailingDomainEntity>,
    private readonly emailingDomainSenderService: EmailingDomainSenderService,
    private readonly workspaceOrmManager: WorkspaceOrmManager,
    @InjectMessageQueue(MessageQueue.emailQueue)
    private readonly messageQueueService: MessageQueueService,
    private readonly messageChannelMetadataService: MessageChannelMetadataService,
    private readonly messageSuppressionService: MessageSuppressionService,
    private readonly userRoleService: UserRoleService,
    private readonly messageCampaignStatisticsService: MessageCampaignStatisticsService,
    private readonly emailBillingService: EmailBillingService,
    private readonly campaignVariableService: CampaignVariableService,
    @InjectCacheStorage(CacheStorageNamespace.ModuleEmailing)
    private readonly cacheStorageService: CacheStorageService,
    private readonly userWorkspaceService: UserWorkspaceService,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly workflowEffectService: WorkflowEffectService,
    private readonly workflowProviderCapabilityRegistryService: WorkflowProviderCapabilityRegistryService,
    private readonly messageCampaignPolicyService: MessageCampaignPolicyService,
    private readonly emailingSystemPolicyService: EmailingSystemPolicyService,
  ) {}

  private getRoleScopedRepository<T extends ObjectLiteral>(
    entity: Type<T>,
    roleId: string,
  ) {
    return this.workspaceOrmManager.getRepository(entity, {
      unionOf: [roleId],
    });
  }

  private getSystemRepository<T extends ObjectLiteral>(entity: Type<T>) {
    return this.workspaceOrmManager.getRepository(entity, {
      shouldBypassPermissionChecks: true,
    });
  }

  async send({
    workspaceId,
    userWorkspaceId,
    campaignId,
  }: SendCampaignArgs): Promise<SendCampaignResult> {
    const roleId = await this.userRoleService.getRoleIdForUserWorkspace({
      workspaceId,
      userWorkspaceId,
    });
    const authContext = await this.resolveCurrentCampaignAuthority({
      workspaceId,
      userWorkspaceId,
      roleId,
    });
    const { value } = await this.messageCampaignPolicyService.execute({
      authContext,
      workspaceId,
      operation: 'campaign.send.enqueue',
      riskClass: 'R3',
      targetResourceType: 'messageCampaign',
      targetResourceId: campaignId,
      actionArguments: { campaignId },
      execute: async ({ rootCorrelationId, policyDecisionId }) => {
        const { fromAddress, listId } =
          await this.workspaceOrmManager.executeInWorkspaceContext(async () => {
            const sendableCampaign =
              await this.findSendableDraftCampaignOrThrow(
                workspaceId,
                campaignId,
                roleId,
              );

            return {
              fromAddress: sendableCampaign.fromAddress.primaryEmail,
              listId: sendableCampaign.listId,
            };
          });

        const emailingDomain = await this.findVerifiedEmailingDomainOrThrow(
          workspaceId,
          fromAddress,
        );

        const { recipients, skipped } =
          await this.workspaceOrmManager.executeInWorkspaceContext(async () => {
            const rawRecipients = await this.resolveRecipientsFromList(
              listId,
              roleId,
            );

            const normalized = normalizeCampaignRecipients(
              rawRecipients,
              MAX_CAMPAIGN_RECIPIENTS,
            );

            const campaignRepository = await this.getRoleScopedRepository(
              MessageCampaignWorkspaceEntity,
              roleId,
            );

            // Conditional update so two concurrent sends cannot both enqueue
            const { affected } = await campaignRepository.update(
              { id: campaignId, status: MessageCampaignStatus.DRAFT },
              { status: MessageCampaignStatus.SENDING },
            );

            if (affected !== 1) {
              throw new EmailingDomainException(
                `Campaign ${campaignId} is no longer a sendable draft`,
                EmailingDomainExceptionCode.MESSAGE_CAMPAIGN_NOT_SENDABLE,
              );
            }

            return {
              recipients: normalized.recipients,
              skipped: normalized.skipped,
            };
          });

        const messageChannel =
          await this.messageChannelMetadataService.getOrCreateEmailGroupChannel(
            {
              fromAddress,
              userWorkspaceId,
              workspaceId,
            },
          );

        await this.messageQueueService.add<MaterializeCampaignJobData>(
          MATERIALIZE_CAMPAIGN_JOB,
          {
            schemaVersion: 1,
            workspaceId,
            userWorkspaceId,
            roleId,
            rootCorrelationId,
            parentPolicyDecisionId: policyDecisionId,
            campaignId,
            listId,
            messageChannelId: messageChannel.id,
            emailingDomainId: emailingDomain.id,
          },
          { id: campaignId, retryLimit: 3 },
        );

        return { campaignId, queuedCount: recipients.length, skipped };
      },
    });

    return value;
  }

  async sendTest({
    workspaceId,
    toAddress,
    subject,
    html,
    fromAddress,
    unsubscribeTopicId,
  }: SendCampaignTestArgs): Promise<EmailingDomainSendEmailResult> {
    const emailingDomain = await this.findVerifiedEmailingDomainOrThrow(
      workspaceId,
      fromAddress,
    );

    const variables =
      await this.campaignVariableService.buildVariablesForPerson(
        workspaceId,
        null,
      );
    const renderedSubject = renderCampaignTemplate(subject, variables, {
      escapeValues: false,
    });
    const compiledContent = await compileCampaignEmailContent(html, variables);

    return this.emailingDomainSenderService.sendEmail(
      workspaceId,
      emailingDomain.id,
      {
        from: fromAddress,
        to: [toAddress],
        subject: renderedSubject,
        text: compiledContent.plainText,
        html: compiledContent.html,
        unsubscribeTopicId,
      },
    );
  }

  private async findVerifiedEmailingDomainOrThrow(
    workspaceId: string,
    fromAddress: string,
  ): Promise<EmailingDomainEntity> {
    const fromDomain = getDomainFromEmail(fromAddress)?.toLowerCase();

    const emailingDomain = await this.emailingDomainRepository.findOne(
      workspaceId,
      { where: { domain: fromDomain, status: EmailingDomainStatus.VERIFIED } },
    );

    if (!isDefined(emailingDomain)) {
      throw new EmailingDomainException(
        `No verified emailing domain matches the from address ${fromAddress}`,
        EmailingDomainExceptionCode.EMAILING_DOMAIN_NOT_VERIFIED,
      );
    }

    return emailingDomain;
  }

  async processMaterializeJob(data: MaterializeCampaignJobData): Promise<void> {
    const {
      workspaceId,
      campaignId,
      listId,
      messageChannelId,
      emailingDomainId,
    } = data;
    const authContext = await this.resolveCurrentCampaignAuthority(data);

    await this.messageCampaignPolicyService.execute({
      authContext,
      workspaceId,
      operation: 'campaign.send.materialize',
      riskClass: 'R1',
      targetResourceType: 'messageCampaign',
      targetResourceId: campaignId,
      actionArguments: { campaignId, listId, messageChannelId },
      rootCorrelationId: data.rootCorrelationId,
      parentDecisionId: data.parentPolicyDecisionId,
      jobId: campaignId,
      execute: async ({ policyDecisionId }) =>
        this.workspaceOrmManager.executeInWorkspaceContext(async () => {
          const campaignRepository = await this.getRoleScopedRepository(
            MessageCampaignWorkspaceEntity,
            data.roleId,
          );

          const campaign = await campaignRepository.findOne({
            where: { id: campaignId },
          });

          if (!isDefined(campaign)) {
            return;
          }

          if (campaign.listId !== listId) {
            throw new Error('Campaign audience changed after enqueue');
          }

          const rawRecipients = await this.resolveRecipientsFromList(
            listId,
            data.roleId,
          );
          const { recipients } = normalizeCampaignRecipients(
            rawRecipients,
            MAX_CAMPAIGN_RECIPIENTS,
          );

          const recipientsByMessageId = new Map<
            string,
            CampaignMessageRecipient
          >();

          for (const recipient of recipients) {
            const messageId = this.campaignMessageId(
              campaignId,
              recipient.personId,
            );

            if (!recipientsByMessageId.has(messageId)) {
              recipientsByMessageId.set(messageId, { ...recipient, messageId });
            }
          }

          const allRecipients = [...recipientsByMessageId.values()];

          const messageRepository = await this.getRoleScopedRepository(
            MessageWorkspaceEntity,
            data.roleId,
          );

          const existingMessages = await messageRepository.find({
            where: { messageCampaignId: campaignId },
            select: { id: true },
          });
          const existingMessageIds = new Set(
            existingMessages.map((message) => message.id),
          );

          const recipientsToCreate = allRecipients.filter(
            (recipient) => !existingMessageIds.has(recipient.messageId),
          );

          if (recipientsToCreate.length > 0) {
            await this.materializeCampaignMessages({
              campaignId,
              messageChannelId,
              fromAddress: campaign.fromAddress?.primaryEmail ?? '',
              subjectTemplate: campaign.subject ?? '',
              bodyTemplate: campaign.bodyTemplate ?? '',
              recipients: recipientsToCreate,
              roleId: data.roleId,
            });
          }

          for (const recipient of allRecipients) {
            await this.messageQueueService.add<SendCampaignEmailJobData>(
              SEND_CAMPAIGN_EMAIL_JOB,
              {
                schemaVersion: 1,
                workspaceId,
                userWorkspaceId: data.userWorkspaceId,
                roleId: data.roleId,
                rootCorrelationId: data.rootCorrelationId,
                parentPolicyDecisionId: policyDecisionId,
                campaignId,
                messageId: recipient.messageId,
                emailingDomainId,
              },
              { id: recipient.messageId, retryLimit: 0 },
            );
          }

          await this.finalizeCampaignIfComplete(
            workspaceId,
            campaignId,
            data.roleId,
          );
        }, authContext),
    });
  }

  async processSendJob(data: SendCampaignEmailJobData): Promise<void> {
    const { workspaceId, campaignId, messageId, emailingDomainId } = data;
    const authContext = await this.resolveCurrentCampaignAuthority(data);
    const effectId = v4();

    try {
      await this.messageCampaignPolicyService.execute({
        authContext,
        workspaceId,
        operation: 'campaign.email.send',
        riskClass: 'R2',
        targetResourceType: 'messageCampaign',
        targetResourceId: campaignId,
        actionArguments: { campaignId, emailingDomainId, messageId },
        rootCorrelationId: data.rootCorrelationId,
        parentDecisionId: data.parentPolicyDecisionId,
        jobId: messageId,
        mutationOrEffectId: effectId,
        execute: async () =>
          this.workspaceOrmManager.executeInWorkspaceContext(async () => {
            const messageRepository = await this.getRoleScopedRepository(
              MessageWorkspaceEntity,
              data.roleId,
            );

            const message = await messageRepository.findOne({
              where: { id: messageId },
            });

            if (
              !isDefined(message) ||
              (message.deliveryStatus !==
                CAMPAIGN_MESSAGE_DELIVERY_STATUS.QUEUED &&
                message.deliveryStatus !==
                  CAMPAIGN_MESSAGE_DELIVERY_STATUS.FAILED)
            ) {
              return;
            }

            const campaignRepository = await this.getRoleScopedRepository(
              MessageCampaignWorkspaceEntity,
              data.roleId,
            );

            const campaign = await campaignRepository.findOne({
              where: { id: campaignId },
            });

            if (!isDefined(campaign)) {
              return;
            }

            const participantRepository = await this.getRoleScopedRepository(
              MessageParticipantWorkspaceEntity,
              data.roleId,
            );
            const recipient = await participantRepository.findOne({
              where: {
                messageId,
                role: MessageParticipantRole.TO,
              },
            });

            if (
              !isDefined(recipient) ||
              !isDefined(recipient.personId) ||
              !isNonEmptyString(recipient.handle)
            ) {
              throw new Error(
                'Campaign recipient is missing or no longer accessible',
              );
            }

            const personId = recipient.personId;
            const recipientEmail = recipient.handle;

            const personRepository = await this.getRoleScopedRepository(
              PersonWorkspaceEntity,
              data.roleId,
            );

            const person = await personRepository.findOne({
              where: { id: personId },
            });

            const variables =
              await this.campaignVariableService.buildVariablesForPerson(
                workspaceId,
                person,
              );
            const subject = renderCampaignTemplate(
              campaign.subject ?? '',
              variables,
              {
                escapeValues: false,
              },
            );
            const compiledContent = await compileCampaignEmailContent(
              campaign.bodyTemplate ?? '',
              variables,
            );
            const fromAddress = campaign.fromAddress?.primaryEmail ?? '';
            const unsubscribeTopicId = campaign.unsubscribeTopicId ?? undefined;
            const actionDigest = buildDeterministicDigest({
              schemaVersion: 1,
              operation: 'campaign.email.send',
              workspaceId,
              campaignId,
              messageId,
              emailingDomainId,
              fromAddress,
              recipientEmail,
              subject,
              text: compiledContent.plainText,
              html: compiledContent.html,
              unsubscribeTopicId,
            });
            const effectKey = buildDeterministicDigest({
              schemaVersion: 1,
              operation: 'campaign.email.send',
              workspaceId,
              campaignId,
              messageId,
            });
            this.workflowProviderCapabilityRegistryService.resolve(
              'MessageCampaignEmail',
            );

            const reservation = await this.workflowEffectService.reserve({
              id: effectId,
              workspaceId,
              effectKey,
              workflowRunId: campaignId,
              stepId: messageId,
              actionDigest,
              providerClass: 'MessageCampaignEmail',
            });

            if (
              reservation.status === 'DUPLICATE' &&
              reservation.execution.state !== 'QUEUED'
            ) {
              return;
            }

            await this.workflowEffectService.transition({
              workspaceId,
              id: reservation.execution.id,
              from: 'QUEUED',
              to: 'RUNNING',
            });

            const hasEmailCredits =
              await this.emailBillingService.hasEmailCredits(workspaceId);

            if (!hasEmailCredits) {
              await messageRepository.update(messageId, {
                deliveryStatus: CAMPAIGN_MESSAGE_DELIVERY_STATUS.SKIPPED,
              });
              await this.workflowEffectService.markSucceeded({
                workspaceId,
                id: reservation.execution.id,
                providerReference: { disposition: 'NO_EMAIL_CREDITS' },
              });

              return;
            }

            try {
              let result: EmailingDomainSendEmailResult;

              try {
                result = await this.emailingDomainSenderService.sendEmail(
                  workspaceId,
                  emailingDomainId,
                  {
                    from: fromAddress,
                    to: [recipientEmail],
                    subject,
                    text: compiledContent.plainText,
                    html: compiledContent.html,
                    unsubscribeTopicId,
                  },
                );
              } catch (error) {
                const code =
                  error instanceof EmailingDomainDriverException
                    ? error.code
                    : null;

                if (
                  code ===
                  EmailingDomainDriverExceptionCode.ALL_RECIPIENTS_SUPPRESSED
                ) {
                  await messageRepository.update(messageId, {
                    deliveryStatus: CAMPAIGN_MESSAGE_DELIVERY_STATUS.SKIPPED,
                  });
                  await this.workflowEffectService.markSucceeded({
                    workspaceId,
                    id: reservation.execution.id,
                    providerReference: { disposition: 'RECIPIENT_SUPPRESSED' },
                  });

                  return;
                }

                const isRetryable =
                  !isDefined(code) ||
                  code === EmailingDomainDriverExceptionCode.TEMPORARY_ERROR ||
                  code === EmailingDomainDriverExceptionCode.UNKNOWN;

                if (isRetryable) {
                  await this.workflowEffectService.markOutcomeUncertain({
                    workspaceId,
                    id: reservation.execution.id,
                    reason: 'CAMPAIGN_PROVIDER_OUTCOME_UNCERTAIN',
                  });
                  this.logger.warn(
                    'Campaign delivery outcome is uncertain and requires reconciliation.',
                  );

                  throw new CampaignEffectRequiresReconciliationError();
                }

                await messageRepository.update(messageId, {
                  deliveryStatus: CAMPAIGN_MESSAGE_DELIVERY_STATUS.FAILED,
                });
                await this.workflowEffectService.markDeadLettered({
                  workspaceId,
                  id: reservation.execution.id,
                  from: 'RUNNING',
                  errorCode: code,
                });
                this.logger.warn(
                  'Campaign delivery failed before provider acceptance.',
                );

                throw new CampaignEffectTerminalFailureError();
              }

              try {
                await messageRepository.update(messageId, {
                  deliveryStatus: CAMPAIGN_MESSAGE_DELIVERY_STATUS.SENT,
                  headerMessageId: result.messageId,
                  subject,
                  text: compiledContent.plainText,
                });

                await this.emailBillingService.billSentEmails({
                  workspaceId,
                  sentEmailCount: 1,
                });

                const associationRepository =
                  await this.getRoleScopedRepository(
                    MessageChannelMessageAssociationWorkspaceEntity,
                    data.roleId,
                  );

                await associationRepository.update(
                  { messageId },
                  {
                    messageExternalId: result.messageId,
                    messageThreadExternalId: result.messageId,
                  },
                );
                await this.workflowEffectService.markSucceeded({
                  workspaceId,
                  id: reservation.execution.id,
                  providerReference: result.messageId,
                });
              } catch {
                await this.workflowEffectService.markOutcomeUncertain({
                  workspaceId,
                  id: reservation.execution.id,
                  reason: 'CAMPAIGN_POST_PROVIDER_PERSISTENCE_UNCERTAIN',
                });
                this.logger.warn(
                  'Campaign delivery persistence is uncertain and requires reconciliation.',
                );
                throw new CampaignEffectRequiresReconciliationError();
              }
            } finally {
              await this.finalizeCampaignIfComplete(
                workspaceId,
                campaignId,
                data.roleId,
              );
            }
          }, authContext),
      });
    } catch (error) {
      if (
        error instanceof CampaignEffectRequiresReconciliationError ||
        error instanceof CampaignEffectTerminalFailureError ||
        error instanceof CampaignPolicyReconciliationRequiredError
      ) {
        return;
      }

      throw error;
    }
  }

  async recordDeliveryFailureByProviderMessageId({
    workspaceId,
    providerMessageId,
    deliveryStatus,
  }: {
    workspaceId: string;
    providerMessageId: string;
    deliveryStatus: string;
  }): Promise<void> {
    await this.emailingSystemPolicyService.execute({
      workspaceId,
      operation: 'campaign.delivery-status.update',
      actionArguments: {
        deliveryStatus,
        providerMessageIdDigest: buildDeterministicDigest({
          providerMessageId,
        }),
      },
      execute: () =>
        this.workspaceOrmManager.executeInWorkspaceContext(async () => {
          const messageRepository = await this.getSystemRepository(
            MessageWorkspaceEntity,
          );

          const message = await messageRepository.findOne({
            where: { headerMessageId: providerMessageId },
          });

          if (!isDefined(message) || !isDefined(message.messageCampaignId)) {
            return;
          }

          if (
            message.deliveryStatus ===
              CAMPAIGN_MESSAGE_DELIVERY_STATUS.BOUNCED ||
            message.deliveryStatus ===
              CAMPAIGN_MESSAGE_DELIVERY_STATUS.COMPLAINED
          ) {
            return;
          }

          await messageRepository.update(message.id, { deliveryStatus });

          await this.scheduleCampaignStatsRefresh({
            workspaceId,
            campaignId: message.messageCampaignId,
          });
        }, buildSystemAuthContext(workspaceId)),
    });
  }

  private async findSendableDraftCampaignOrThrow(
    workspaceId: string,
    campaignId: string,
    roleId: string,
  ): Promise<SendableDraftCampaign> {
    const campaignRepository = await this.getRoleScopedRepository(
      MessageCampaignWorkspaceEntity,
      roleId,
    );

    const campaign = await campaignRepository.findOne({
      where: { id: campaignId },
    });

    if (!isDefined(campaign)) {
      throw new EmailingDomainException(
        `Campaign ${campaignId} not found`,
        EmailingDomainExceptionCode.MESSAGE_CAMPAIGN_NOT_FOUND,
      );
    }

    const sendableCampaign = sendableDraftCampaignSchema.safeParse(campaign);

    if (!sendableCampaign.success) {
      throw new EmailingDomainException(
        `Campaign ${campaignId} is not sendable: ${sendableCampaign.error.issues
          .map((issue) => `${issue.path.join('.')} ${issue.message}`)
          .join(', ')}`,
        EmailingDomainExceptionCode.MESSAGE_CAMPAIGN_NOT_SENDABLE,
      );
    }

    await this.campaignVariableService.assertKnownVariables(
      workspaceId,
      collectCampaignVariableNamesFromTemplates({
        subject: sendableCampaign.data.subject,
        bodyTemplate: sendableCampaign.data.bodyTemplate,
      }),
    );

    return sendableCampaign.data;
  }

  private async materializeCampaignMessages({
    campaignId,
    messageChannelId,
    fromAddress,
    subjectTemplate,
    bodyTemplate,
    recipients,
    roleId,
  }: {
    campaignId: string;
    messageChannelId: string;
    fromAddress: string;
    subjectTemplate: string;
    bodyTemplate: string;
    recipients: CampaignMessageRecipient[];
    roleId: string;
  }): Promise<void> {
    const now = new Date();
    // The stored message keeps the unresolved template, so placeholders stay
    // visible on the campaign's message records.
    const { plainText: text } = await compileCampaignEmailContent(
      bodyTemplate,
      null,
    );
    const rows = recipients.map((recipient) => ({
      recipient,
      messageId: recipient.messageId,
      threadId: v4(),
      temporaryExternalId: v4(),
    }));

    await this.workspaceOrmManager.runInWorkspaceTransaction(
      async (transactionScope) => {
        const messageThreadRepository =
          transactionScope.getRepository<MessageThreadWorkspaceEntity>(
            'messageThread',
            { unionOf: [roleId] },
          );
        const messageRepository =
          transactionScope.getRepository<MessageWorkspaceEntity>('message', {
            unionOf: [roleId],
          });
        const associationRepository =
          transactionScope.getRepository<MessageChannelMessageAssociationWorkspaceEntity>(
            'messageChannelMessageAssociation',
            { unionOf: [roleId] },
          );
        const participantRepository =
          transactionScope.getRepository<MessageParticipantWorkspaceEntity>(
            'messageParticipant',
            { unionOf: [roleId] },
          );

        await messageThreadRepository.insert(
          rows.map((row) => ({ id: row.threadId })),
        );
        await messageRepository.insert(
          rows.map((row) => ({
            id: row.messageId,
            headerMessageId: row.temporaryExternalId,
            subject: subjectTemplate,
            text,
            receivedAt: now,
            messageThreadId: row.threadId,
            messageCampaignId: campaignId,
            deliveryStatus: CAMPAIGN_MESSAGE_DELIVERY_STATUS.QUEUED,
          })),
        );
        await associationRepository.insert(
          rows.map((row) => ({
            id: v4(),
            messageId: row.messageId,
            messageChannelId,
            messageExternalId: row.temporaryExternalId,
            messageThreadExternalId: row.temporaryExternalId,
            direction: MessageDirection.OUTGOING,
          })),
        );
        await participantRepository.insert(
          rows.flatMap((row) => [
            {
              id: v4(),
              messageId: row.messageId,
              role: MessageParticipantRole.FROM,
              handle: fromAddress,
              displayName: fromAddress,
            },
            {
              id: v4(),
              messageId: row.messageId,
              role: MessageParticipantRole.TO,
              handle: row.recipient.email,
              displayName: row.recipient.email,
              personId: row.recipient.personId,
              messageCampaignId: campaignId,
            },
          ]),
        );
      },
    );
  }

  private async finalizeCampaignIfComplete(
    workspaceId: string,
    campaignId: string,
    roleId: string,
  ): Promise<void> {
    const messageRepository = await this.getRoleScopedRepository(
      MessageWorkspaceEntity,
      roleId,
    );

    const queuedCount = await messageRepository.count({
      where: {
        messageCampaignId: campaignId,
        deliveryStatus: CAMPAIGN_MESSAGE_DELIVERY_STATUS.QUEUED,
      },
    });

    if (queuedCount > 0) {
      return;
    }

    const failedCount = await messageRepository.count({
      where: {
        messageCampaignId: campaignId,
        deliveryStatus: CAMPAIGN_MESSAGE_DELIVERY_STATUS.FAILED,
      },
    });

    const campaignRepository = await this.getRoleScopedRepository(
      MessageCampaignWorkspaceEntity,
      roleId,
    );

    await campaignRepository.update(
      { id: campaignId, status: MessageCampaignStatus.SENDING },
      {
        status:
          failedCount > 0
            ? MessageCampaignStatus.SENT_WITH_ERRORS
            : MessageCampaignStatus.SENT,
        sentAt: new Date(),
      },
    );

    await this.scheduleCampaignStatsRefresh({
      workspaceId,
      campaignId,
    });
  }

  private async scheduleCampaignStatsRefresh({
    workspaceId,
    campaignId,
  }: {
    workspaceId: string;
    campaignId: string;
  }): Promise<void> {
    const acquired = await this.cacheStorageService.acquireLock(
      `campaign-stats-refresh:${workspaceId}:${campaignId}`,
      CAMPAIGN_STATS_REFRESH_DELAY_MS,
    );

    if (!acquired) {
      return;
    }

    await this.messageQueueService.add<RefreshCampaignStatsJobData>(
      REFRESH_CAMPAIGN_STATS_JOB,
      { workspaceId, campaignId },
      { delay: CAMPAIGN_STATS_REFRESH_DELAY_MS },
    );
  }

  async previewAudience({
    workspaceId,
    userWorkspaceId,
    listId,
    unsubscribeTopicId,
  }: {
    workspaceId: string;
    userWorkspaceId: string;
    listId: string;
    unsubscribeTopicId?: string;
  }): Promise<CampaignAudiencePreview> {
    const roleId = await this.userRoleService.getRoleIdForUserWorkspace({
      workspaceId,
      userWorkspaceId,
    });

    return this.workspaceOrmManager.executeInWorkspaceContext(async () => {
      const rawRecipients = await this.resolveRecipientsFromList(
        listId,
        roleId,
      );
      const totalMembers = rawRecipients.length;

      const { recipients, skipped } = normalizeCampaignRecipients(
        rawRecipients,
        MAX_CAMPAIGN_RECIPIENTS,
      );

      const emails = recipients.map((recipient) => recipient.email);

      const globallySuppressed =
        await this.messageSuppressionService.getSuppressedAddresses(
          workspaceId,
          emails,
        );
      const topicSuppressed = isNonEmptyString(unsubscribeTopicId)
        ? await this.messageSuppressionService.getTopicSuppressedAddresses(
            workspaceId,
            emails,
            unsubscribeTopicId,
          )
        : new Set<string>();

      let globallyUnsubscribed = 0;
      let topicUnsubscribed = 0;
      let sendable = 0;

      for (const recipient of recipients) {
        const normalizedEmail = recipient.email.trim().toLowerCase();

        if (globallySuppressed.has(normalizedEmail)) {
          globallyUnsubscribed += 1;
        } else if (topicSuppressed.has(normalizedEmail)) {
          topicUnsubscribed += 1;
        } else {
          sendable += 1;
        }
      }

      return {
        totalMembers,
        withoutEmail: skipped.noEmail,
        duplicateEmails: skipped.deduped,
        globallyUnsubscribed,
        topicUnsubscribed,
        sendable,
      };
    });
  }

  private async resolveRecipientsFromList(
    listId: string,
    roleId: string,
  ): Promise<RawCampaignRecipient[]> {
    const listMemberRepository = await this.getRoleScopedRepository(
      MessageListMemberWorkspaceEntity,
      roleId,
    );

    const members = await listMemberRepository.find({
      where: { listId },
    });

    return this.loadRecipientsByPersonIds(
      members.map((member) => member.personId),
      roleId,
    );
  }

  private async loadRecipientsByPersonIds(
    personIds: string[],
    roleId: string,
  ): Promise<RawCampaignRecipient[]> {
    if (personIds.length === 0) {
      return [];
    }

    const personRepository = await this.getRoleScopedRepository(
      PersonWorkspaceEntity,
      roleId,
    );

    const people = await personRepository.find({
      where: { id: In(personIds) },
    });

    return people.map(toRawRecipient);
  }

  private campaignMessageId(campaignId: string, personId: string): string {
    return v5(`${campaignId}:${personId}`, CAMPAIGN_MESSAGE_ID_NAMESPACE);
  }

  private async resolveCurrentCampaignAuthority({
    workspaceId,
    userWorkspaceId,
    roleId,
  }: Pick<
    MaterializeCampaignJobData,
    'workspaceId' | 'userWorkspaceId' | 'roleId'
  >): Promise<UserWorkspaceAuthContext> {
    const currentRoleId = await this.userRoleService.getRoleIdForUserWorkspace({
      workspaceId,
      userWorkspaceId,
    });

    if (currentRoleId !== roleId) {
      throw new Error('Campaign authority changed after enqueue');
    }

    const userWorkspace =
      await this.userWorkspaceService.findById(userWorkspaceId);

    if (
      !isDefined(userWorkspace) ||
      userWorkspace.workspaceId !== workspaceId ||
      isDefined(userWorkspace.deletedAt)
    ) {
      throw new Error('Campaign actor identity is no longer active');
    }

    const hydratedUserWorkspace =
      await this.userWorkspaceService.getUserWorkspaceForUser({
        userId: userWorkspace.userId,
        workspaceId,
        relations: ['workspace', 'user'],
      });

    if (
      !isDefined(hydratedUserWorkspace) ||
      hydratedUserWorkspace.id !== userWorkspaceId ||
      hydratedUserWorkspace.userId !== userWorkspace.userId ||
      hydratedUserWorkspace.workspaceId !== workspaceId ||
      isDefined(hydratedUserWorkspace.deletedAt) ||
      !isDefined(hydratedUserWorkspace.workspace) ||
      !isDefined(hydratedUserWorkspace.user) ||
      hydratedUserWorkspace.user.disabled === true ||
      isDefined(hydratedUserWorkspace.user.deletedAt)
    ) {
      throw new Error('Campaign actor identity is no longer active');
    }

    const { flatWorkspaceMemberMaps } =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'flatWorkspaceMemberMaps',
      ]);
    const workspaceMemberId =
      flatWorkspaceMemberMaps.idByUserId[userWorkspace.userId];
    const workspaceMember = isDefined(workspaceMemberId)
      ? flatWorkspaceMemberMaps.byId[workspaceMemberId]
      : undefined;

    if (
      !isDefined(workspaceMemberId) ||
      !isDefined(workspaceMember) ||
      workspaceMember.userId !== userWorkspace.userId ||
      isDefined(workspaceMember.deletedAt)
    ) {
      throw new Error('Campaign actor identity is no longer active');
    }

    return buildUserAuthContext({
      workspace: fromWorkspaceEntityToFlat(hydratedUserWorkspace.workspace),
      userWorkspaceId,
      user: fromUserEntityToFlat(hydratedUserWorkspace.user),
      workspaceMemberId,
      workspaceMember,
    });
  }
}
