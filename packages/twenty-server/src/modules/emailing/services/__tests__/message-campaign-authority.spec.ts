import { type MaterializeCampaignJobData } from 'src/engine/core-modules/emailing-domain/types/materialize-campaign-job-data.type';
import { type SendCampaignEmailJobData } from 'src/engine/core-modules/emailing-domain/types/send-campaign-email-job-data.type';
import { Logger } from '@nestjs/common';
import {
  CAMPAIGN_MESSAGE_DELIVERY_STATUS,
  CAMPAIGN_MESSAGE_ID_NAMESPACE,
} from 'src/engine/core-modules/emailing-domain/constants/campaign.constant';
import { MessageCampaignService } from 'src/modules/emailing/services/message-campaign.service';
import { EMAIL_DOCUMENT_SCHEMA_VERSION } from 'twenty-shared/utils';
import { MessageCampaignStatus } from 'twenty-shared/types';
import { v5 } from 'uuid';

const WORKSPACE_ID = '20202020-aaaa-4d02-bf25-6aeccf7ea419';
const CAMPAIGN_ID = '20202020-ffff-4d02-bf25-6aeccf7ea419';
const USER_WORKSPACE_ID = '20202020-bbbb-4d02-bf25-6aeccf7ea419';
const ORIGIN_ROLE_ID = '20202020-cccc-4d02-bf25-6aeccf7ea419';
const CURRENT_ROLE_ID = '20202020-dddd-4d02-bf25-6aeccf7ea419';
const USER_ID = '20202020-3333-4d02-bf25-6aeccf7ea419';
const WORKSPACE_MEMBER_ID = '20202020-4444-4d02-bf25-6aeccf7ea419';
const PARENT_POLICY_DECISION_ID = '20202020-aaaa-4d02-bf25-6aeccf7ea420';
const CHILD_POLICY_DECISION_ID = '20202020-aaaa-4d02-bf25-6aeccf7ea421';

const buildService = ({
  currentRoleId = CURRENT_ROLE_ID,
  workspaceMemberDeleted = false,
  userDisabled = false,
} = {}) => {
  const campaignRepository = {
    findOne: jest.fn().mockResolvedValue(null),
  };
  const workspaceOrmManager = {
    executeInWorkspaceContext: jest
      .fn()
      .mockImplementation(async (callback) => callback()),
    getRepository: jest.fn().mockReturnValue(campaignRepository),
  };
  const userRoleService = {
    getRoleIdForUserWorkspace: jest.fn().mockResolvedValue(currentRoleId),
  };
  const userWorkspaceService = {
    findById: jest.fn().mockResolvedValue({
      id: USER_WORKSPACE_ID,
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
      deletedAt: null,
    }),
    getUserWorkspaceForUser: jest.fn().mockResolvedValue({
      id: USER_WORKSPACE_ID,
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
      deletedAt: null,
      workspace: {
        id: WORKSPACE_ID,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      },
      user: {
        id: USER_ID,
        email: 'sender@example.com',
        firstName: 'Sender',
        lastName: 'User',
        isEmailVerified: true,
        disabled: userDisabled,
        canImpersonate: false,
        canAccessFullAdminPanel: false,
        locale: 'en',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      },
    }),
  };
  const workspaceMember = {
    id: WORKSPACE_MEMBER_ID,
    userId: USER_ID,
    deletedAt: workspaceMemberDeleted ? new Date('2026-09-01') : null,
  };
  const workspaceCacheService = {
    getOrRecompute: jest.fn().mockResolvedValue({
      flatWorkspaceMemberMaps: {
        byId: { [WORKSPACE_MEMBER_ID]: workspaceMember },
        idByUserId: { [USER_ID]: WORKSPACE_MEMBER_ID },
      },
    }),
  };
  const service = Reflect.construct(MessageCampaignService, [
    {},
    {},
    workspaceOrmManager,
    {},
    {},
    {},
    userRoleService,
    {},
    {},
    {},
    {},
    userWorkspaceService,
    workspaceCacheService,
    {},
    {},
    {
      execute: jest.fn().mockImplementation(async ({ execute }) => ({
        value: await execute({
          rootCorrelationId: '20202020-eeee-4d02-bf25-6aeccf7ea419',
          policyDecisionId: CHILD_POLICY_DECISION_ID,
        }),
        rootCorrelationId: '20202020-eeee-4d02-bf25-6aeccf7ea419',
        policyDecisionId: CHILD_POLICY_DECISION_ID,
      })),
    },
  ]) as MessageCampaignService;

  return {
    service,
    userRoleService,
    userWorkspaceService,
    workspaceCacheService,
    workspaceOrmManager,
  };
};

describe('MessageCampaignService queued authority', () => {
  it('denies materialization when the actor role changed after enqueue', async () => {
    const { service, workspaceOrmManager } = buildService();
    const data: MaterializeCampaignJobData = {
      schemaVersion: 1,
      workspaceId: WORKSPACE_ID,
      userWorkspaceId: USER_WORKSPACE_ID,
      roleId: ORIGIN_ROLE_ID,
      rootCorrelationId: '20202020-eeee-4d02-bf25-6aeccf7ea419',
      parentPolicyDecisionId: PARENT_POLICY_DECISION_ID,
      campaignId: '20202020-ffff-4d02-bf25-6aeccf7ea419',
      listId: '20202020-9999-4d02-bf25-6aeccf7ea419',
      messageChannelId: '20202020-1111-4d02-bf25-6aeccf7ea419',
      emailingDomainId: '20202020-2222-4d02-bf25-6aeccf7ea419',
    };

    await expect(service.processMaterializeJob(data)).rejects.toThrow(
      'Campaign authority changed after enqueue',
    );
    expect(
      workspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
  });

  it('opens materialization repositories with revalidated role authority', async () => {
    const { service, workspaceOrmManager } = buildService({
      currentRoleId: ORIGIN_ROLE_ID,
    });
    const data: MaterializeCampaignJobData = {
      schemaVersion: 1,
      workspaceId: WORKSPACE_ID,
      userWorkspaceId: USER_WORKSPACE_ID,
      roleId: ORIGIN_ROLE_ID,
      rootCorrelationId: '20202020-eeee-4d02-bf25-6aeccf7ea419',
      parentPolicyDecisionId: PARENT_POLICY_DECISION_ID,
      campaignId: '20202020-ffff-4d02-bf25-6aeccf7ea419',
      listId: '20202020-9999-4d02-bf25-6aeccf7ea419',
      messageChannelId: '20202020-1111-4d02-bf25-6aeccf7ea419',
      emailingDomainId: '20202020-2222-4d02-bf25-6aeccf7ea419',
    };

    await service.processMaterializeJob(data);

    expect(workspaceOrmManager.getRepository).toHaveBeenCalledWith(
      expect.any(Function),
      { unionOf: [ORIGIN_ROLE_ID] },
    );
    expect(workspaceOrmManager.getRepository).not.toHaveBeenCalledWith(
      expect.anything(),
      { shouldBypassPermissionChecks: true },
    );
  });

  it('denies materialization for a deleted workspace member', async () => {
    const { service, workspaceOrmManager } = buildService({
      currentRoleId: ORIGIN_ROLE_ID,
      workspaceMemberDeleted: true,
    });
    const data: MaterializeCampaignJobData = {
      schemaVersion: 1,
      workspaceId: WORKSPACE_ID,
      userWorkspaceId: USER_WORKSPACE_ID,
      roleId: ORIGIN_ROLE_ID,
      rootCorrelationId: '20202020-eeee-4d02-bf25-6aeccf7ea419',
      parentPolicyDecisionId: PARENT_POLICY_DECISION_ID,
      campaignId: '20202020-ffff-4d02-bf25-6aeccf7ea419',
      listId: '20202020-9999-4d02-bf25-6aeccf7ea419',
      messageChannelId: '20202020-1111-4d02-bf25-6aeccf7ea419',
      emailingDomainId: '20202020-2222-4d02-bf25-6aeccf7ea419',
    };

    await expect(service.processMaterializeJob(data)).rejects.toThrow(
      'Campaign actor identity is no longer active',
    );
    expect(
      workspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
  });

  it('denies materialization for a disabled user', async () => {
    const { service, workspaceOrmManager } = buildService({
      currentRoleId: ORIGIN_ROLE_ID,
      userDisabled: true,
    });
    const data: MaterializeCampaignJobData = {
      schemaVersion: 1,
      workspaceId: WORKSPACE_ID,
      userWorkspaceId: USER_WORKSPACE_ID,
      roleId: ORIGIN_ROLE_ID,
      rootCorrelationId: '20202020-eeee-4d02-bf25-6aeccf7ea419',
      parentPolicyDecisionId: PARENT_POLICY_DECISION_ID,
      campaignId: '20202020-ffff-4d02-bf25-6aeccf7ea419',
      listId: '20202020-9999-4d02-bf25-6aeccf7ea419',
      messageChannelId: '20202020-1111-4d02-bf25-6aeccf7ea419',
      emailingDomainId: '20202020-2222-4d02-bf25-6aeccf7ea419',
    };

    await expect(service.processMaterializeJob(data)).rejects.toThrow(
      'Campaign actor identity is no longer active',
    );
    expect(
      workspaceOrmManager.executeInWorkspaceContext,
    ).not.toHaveBeenCalled();
  });

  it('does not serialize recipient data into the materialize job', async () => {
    const listId = '20202020-5555-4d02-bf25-6aeccf7ea419';
    const personId = '20202020-6666-4d02-bf25-6aeccf7ea419';
    const campaignRepository = {
      findOne: jest.fn().mockResolvedValue({
        status: MessageCampaignStatus.DRAFT,
        subject: 'Monthly update',
        bodyTemplate: JSON.stringify({
          type: 'doc',
          attrs: { schemaVersion: EMAIL_DOCUMENT_SCHEMA_VERSION },
          content: [],
        }),
        fromAddress: { primaryEmail: 'sender@example.com' },
        listId,
      }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const listMemberRepository = {
      find: jest.fn().mockResolvedValue([{ personId }]),
    };
    const personRepository = {
      find: jest
        .fn()
        .mockResolvedValue([
          { id: personId, emails: { primaryEmail: 'recipient@example.com' } },
        ]),
    };
    const workspaceOrmManager = {
      executeInWorkspaceContext: jest
        .fn()
        .mockImplementation(async (callback) => callback()),
      getRepository: jest.fn().mockImplementation((entity) => {
        if (entity.name === 'MessageCampaignWorkspaceEntity') {
          return campaignRepository;
        }

        if (entity.name === 'MessageListMemberWorkspaceEntity') {
          return listMemberRepository;
        }

        return personRepository;
      }),
    };
    const messageQueueService = { add: jest.fn().mockResolvedValue(undefined) };
    const { userWorkspaceService, workspaceCacheService } = buildService({
      currentRoleId: ORIGIN_ROLE_ID,
    });
    const messageCampaignPolicyService = {
      execute: jest.fn().mockImplementation(async ({ execute }) => ({
        value: await execute({
          rootCorrelationId: '20202020-eeee-4d02-bf25-6aeccf7ea419',
          policyDecisionId: PARENT_POLICY_DECISION_ID,
        }),
        rootCorrelationId: '20202020-eeee-4d02-bf25-6aeccf7ea419',
        policyDecisionId: PARENT_POLICY_DECISION_ID,
      })),
    };
    const service = Reflect.construct(MessageCampaignService, [
      {
        findOne: jest.fn().mockResolvedValue({
          id: '20202020-7777-4d02-bf25-6aeccf7ea419',
        }),
      },
      {},
      workspaceOrmManager,
      messageQueueService,
      {
        getOrCreateEmailGroupChannel: jest.fn().mockResolvedValue({
          id: '20202020-8888-4d02-bf25-6aeccf7ea419',
        }),
      },
      {},
      {
        getRoleIdForUserWorkspace: jest.fn().mockResolvedValue(ORIGIN_ROLE_ID),
      },
      {},
      {},
      { assertKnownVariables: jest.fn().mockResolvedValue(undefined) },
      {},
      userWorkspaceService,
      workspaceCacheService,
      {},
      {},
      messageCampaignPolicyService,
    ]) as MessageCampaignService;

    await service.send({
      workspaceId: WORKSPACE_ID,
      userWorkspaceId: USER_WORKSPACE_ID,
      campaignId: CAMPAIGN_ID,
    });

    const queuedPayload = messageQueueService.add.mock.calls[0][1];

    expect(queuedPayload).toMatchObject({
      schemaVersion: 1,
      workspaceId: WORKSPACE_ID,
      userWorkspaceId: USER_WORKSPACE_ID,
      roleId: ORIGIN_ROLE_ID,
      rootCorrelationId: '20202020-eeee-4d02-bf25-6aeccf7ea419',
      parentPolicyDecisionId: PARENT_POLICY_DECISION_ID,
      campaignId: CAMPAIGN_ID,
      listId,
    });
    expect(queuedPayload).not.toHaveProperty('recipients');
    expect(messageQueueService.add.mock.calls[0][2]).toEqual({
      id: CAMPAIGN_ID,
      retryLimit: 3,
    });
  });

  it('does not serialize recipient data into send jobs', async () => {
    const listId = '20202020-5555-4d02-bf25-6aeccf7ea419';
    const personId = '20202020-6666-4d02-bf25-6aeccf7ea419';
    const campaignRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: CAMPAIGN_ID,
        listId,
        subject: 'Monthly update',
        bodyTemplate: JSON.stringify({
          type: 'doc',
          attrs: { schemaVersion: EMAIL_DOCUMENT_SCHEMA_VERSION },
          content: [],
        }),
        fromAddress: { primaryEmail: 'sender@example.com' },
      }),
    };
    const listMemberRepository = {
      find: jest.fn().mockResolvedValue([{ personId }]),
    };
    const personRepository = {
      find: jest
        .fn()
        .mockResolvedValue([
          { id: personId, emails: { primaryEmail: 'recipient@example.com' } },
        ]),
    };
    const messageId = v5(
      `${CAMPAIGN_ID}:${personId}`,
      CAMPAIGN_MESSAGE_ID_NAMESPACE,
    );
    const messageRepository = {
      find: jest.fn().mockResolvedValue([{ id: messageId }]),
      count: jest.fn().mockResolvedValue(1),
    };
    const workspaceOrmManager = {
      executeInWorkspaceContext: jest
        .fn()
        .mockImplementation(async (callback) => callback()),
      getRepository: jest.fn().mockImplementation((entity) => {
        if (entity.name === 'MessageCampaignWorkspaceEntity') {
          return campaignRepository;
        }

        if (entity.name === 'MessageListMemberWorkspaceEntity') {
          return listMemberRepository;
        }

        if (entity.name === 'PersonWorkspaceEntity') {
          return personRepository;
        }

        return messageRepository;
      }),
      runInWorkspaceTransaction: jest
        .fn()
        .mockImplementation(async (callback) =>
          callback({
            getRepository: jest.fn().mockReturnValue({
              insert: jest.fn().mockResolvedValue(undefined),
            }),
          }),
        ),
    };
    const messageQueueService = { add: jest.fn().mockResolvedValue(undefined) };
    const { userWorkspaceService, workspaceCacheService } = buildService({
      currentRoleId: ORIGIN_ROLE_ID,
    });
    const messageCampaignPolicyService = {
      execute: jest.fn().mockImplementation(async ({ execute }) => ({
        value: await execute({
          rootCorrelationId: '20202020-eeee-4d02-bf25-6aeccf7ea419',
          policyDecisionId: CHILD_POLICY_DECISION_ID,
        }),
        rootCorrelationId: '20202020-eeee-4d02-bf25-6aeccf7ea419',
        policyDecisionId: CHILD_POLICY_DECISION_ID,
      })),
    };
    const service = Reflect.construct(MessageCampaignService, [
      {},
      {},
      workspaceOrmManager,
      messageQueueService,
      {},
      {},
      {
        getRoleIdForUserWorkspace: jest.fn().mockResolvedValue(ORIGIN_ROLE_ID),
      },
      {},
      {},
      {},
      {},
      userWorkspaceService,
      workspaceCacheService,
      {},
      {},
      messageCampaignPolicyService,
    ]) as MessageCampaignService;
    const data: MaterializeCampaignJobData = {
      schemaVersion: 1,
      workspaceId: WORKSPACE_ID,
      userWorkspaceId: USER_WORKSPACE_ID,
      roleId: ORIGIN_ROLE_ID,
      rootCorrelationId: '20202020-eeee-4d02-bf25-6aeccf7ea419',
      parentPolicyDecisionId: PARENT_POLICY_DECISION_ID,
      campaignId: CAMPAIGN_ID,
      listId,
      messageChannelId: '20202020-8888-4d02-bf25-6aeccf7ea419',
      emailingDomainId: '20202020-7777-4d02-bf25-6aeccf7ea419',
    };

    await service.processMaterializeJob(data);

    const queuedPayload = messageQueueService.add.mock.calls[0][1];

    expect(queuedPayload).toMatchObject({
      schemaVersion: 1,
      workspaceId: WORKSPACE_ID,
      userWorkspaceId: USER_WORKSPACE_ID,
      roleId: ORIGIN_ROLE_ID,
      campaignId: CAMPAIGN_ID,
      parentPolicyDecisionId: CHILD_POLICY_DECISION_ID,
    });
    expect(queuedPayload).not.toHaveProperty('personId');
    expect(queuedPayload).not.toHaveProperty('recipientEmail');
    expect(messageQueueService.add.mock.calls[0][2]).toEqual({
      id: messageId,
      retryLimit: 0,
    });
    expect(messageCampaignPolicyService.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'campaign.send.materialize',
        riskClass: 'R1',
        parentDecisionId: PARENT_POLICY_DECISION_ID,
        rootCorrelationId: '20202020-eeee-4d02-bf25-6aeccf7ea419',
      }),
    );
  });

  it('marks an ambiguous provider exception uncertain without queue retry', async () => {
    const messageId = '20202020-7777-4d02-bf25-6aeccf7ea419';
    const personId = '20202020-6666-4d02-bf25-6aeccf7ea419';
    const messageRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: messageId,
        deliveryStatus: CAMPAIGN_MESSAGE_DELIVERY_STATUS.QUEUED,
      }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      count: jest.fn().mockResolvedValue(1),
    };
    const campaignRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: CAMPAIGN_ID,
        subject: 'Monthly update',
        bodyTemplate: '',
        fromAddress: { primaryEmail: 'sender@example.com' },
        unsubscribeTopicId: null,
      }),
    };
    const participantRepository = {
      findOne: jest.fn().mockResolvedValue({
        personId,
        handle: 'recipient@example.com',
      }),
    };
    const personRepository = {
      findOne: jest.fn().mockResolvedValue({ id: personId }),
    };
    const associationRepository = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const workspaceOrmManager = {
      executeInWorkspaceContext: jest
        .fn()
        .mockImplementation(async (callback) => callback()),
      getRepository: jest.fn().mockImplementation((entity) => {
        if (entity.name === 'MessageCampaignWorkspaceEntity') {
          return campaignRepository;
        }

        if (entity.name === 'MessageParticipantWorkspaceEntity') {
          return participantRepository;
        }

        if (entity.name === 'PersonWorkspaceEntity') {
          return personRepository;
        }

        if (entity.name === 'MessageChannelMessageAssociationWorkspaceEntity') {
          return associationRepository;
        }

        return messageRepository;
      }),
    };
    const providerError = new Error('connection reset after acceptance');
    const emailingDomainSenderService = {
      sendEmail: jest.fn().mockRejectedValue(providerError),
    };
    const workflowEffectService = {
      reserve: jest.fn().mockResolvedValue({
        status: 'RESERVED',
        execution: { id: '20202020-8888-4d02-bf25-6aeccf7ea419' },
      }),
      transition: jest.fn().mockResolvedValue(undefined),
      markOutcomeUncertain: jest.fn().mockResolvedValue(undefined),
      markSucceeded: jest.fn().mockResolvedValue(undefined),
      markDeadLettered: jest.fn().mockResolvedValue(undefined),
    };
    const workflowProviderCapabilityRegistryService = {
      resolve: jest.fn().mockReturnValue({
        providerClass: 'MessageCampaignEmail',
        supportsIdempotencyKey: false,
        supportsOutcomeReconciliation: false,
        maximumAutomaticAttempts: 1,
      }),
    };
    const messageCampaignPolicyService = {
      execute: jest.fn().mockImplementation(async ({ execute }) => ({
        value: await execute({
          rootCorrelationId: '20202020-eeee-4d02-bf25-6aeccf7ea419',
          policyDecisionId: CHILD_POLICY_DECISION_ID,
        }),
        rootCorrelationId: '20202020-eeee-4d02-bf25-6aeccf7ea419',
        policyDecisionId: CHILD_POLICY_DECISION_ID,
      })),
    };
    const { userWorkspaceService, workspaceCacheService } = buildService({
      currentRoleId: ORIGIN_ROLE_ID,
    });
    const service = Reflect.construct(MessageCampaignService, [
      {},
      emailingDomainSenderService,
      workspaceOrmManager,
      {},
      {},
      {},
      {
        getRoleIdForUserWorkspace: jest.fn().mockResolvedValue(ORIGIN_ROLE_ID),
      },
      {},
      {
        hasEmailCredits: jest.fn().mockResolvedValue(true),
        billSentEmails: jest.fn().mockResolvedValue(undefined),
      },
      { buildVariablesForPerson: jest.fn().mockResolvedValue({}) },
      {},
      userWorkspaceService,
      workspaceCacheService,
      workflowEffectService,
      workflowProviderCapabilityRegistryService,
      messageCampaignPolicyService,
    ]) as MessageCampaignService;
    const data: SendCampaignEmailJobData = {
      schemaVersion: 1,
      workspaceId: WORKSPACE_ID,
      userWorkspaceId: USER_WORKSPACE_ID,
      roleId: ORIGIN_ROLE_ID,
      rootCorrelationId: '20202020-eeee-4d02-bf25-6aeccf7ea419',
      parentPolicyDecisionId: PARENT_POLICY_DECISION_ID,
      campaignId: CAMPAIGN_ID,
      messageId,
      emailingDomainId: '20202020-9999-4d02-bf25-6aeccf7ea419',
    };

    await expect(service.processSendJob(data)).resolves.toBeUndefined();

    expect(emailingDomainSenderService.sendEmail).toHaveBeenCalledTimes(1);
    expect(
      workflowProviderCapabilityRegistryService.resolve,
    ).toHaveBeenCalledWith('MessageCampaignEmail');
    expect(messageCampaignPolicyService.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'campaign.email.send',
        riskClass: 'R2',
        parentDecisionId: PARENT_POLICY_DECISION_ID,
        rootCorrelationId: '20202020-eeee-4d02-bf25-6aeccf7ea419',
      }),
    );
    expect(workflowEffectService.markOutcomeUncertain).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      id: '20202020-8888-4d02-bf25-6aeccf7ea419',
      reason: 'CAMPAIGN_PROVIDER_OUTCOME_UNCERTAIN',
    });
    expect(messageRepository.update).not.toHaveBeenCalledWith(messageId, {
      deliveryStatus: CAMPAIGN_MESSAGE_DELIVERY_STATUS.FAILED,
    });
  }, 15_000);

  it('marks accepted delivery uncertain when local persistence fails', async () => {
    const messageId = '20202020-7777-4d02-bf25-6aeccf7ea419';
    const personId = '20202020-6666-4d02-bf25-6aeccf7ea419';
    const messageRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: messageId,
        deliveryStatus: CAMPAIGN_MESSAGE_DELIVERY_STATUS.QUEUED,
      }),
      update: jest.fn().mockImplementation(async (_id, update) => {
        if (update.deliveryStatus === CAMPAIGN_MESSAGE_DELIVERY_STATUS.SENT) {
          throw new Error('database timeout after provider acceptance');
        }

        return { affected: 1 };
      }),
      count: jest.fn().mockResolvedValue(1),
    };
    const campaignRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: CAMPAIGN_ID,
        subject: 'Monthly update',
        bodyTemplate: '',
        fromAddress: { primaryEmail: 'sender@example.com' },
        unsubscribeTopicId: null,
      }),
    };
    const participantRepository = {
      findOne: jest.fn().mockResolvedValue({
        personId,
        handle: 'recipient@example.com',
      }),
    };
    const personRepository = {
      findOne: jest.fn().mockResolvedValue({ id: personId }),
    };
    const associationRepository = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const workspaceOrmManager = {
      executeInWorkspaceContext: jest
        .fn()
        .mockImplementation(async (callback) => callback()),
      getRepository: jest.fn().mockImplementation((entity) => {
        if (entity.name === 'MessageCampaignWorkspaceEntity') {
          return campaignRepository;
        }

        if (entity.name === 'MessageParticipantWorkspaceEntity') {
          return participantRepository;
        }

        if (entity.name === 'PersonWorkspaceEntity') {
          return personRepository;
        }

        if (entity.name === 'MessageChannelMessageAssociationWorkspaceEntity') {
          return associationRepository;
        }

        return messageRepository;
      }),
    };
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
    const workflowEffectService = {
      reserve: jest.fn().mockResolvedValue({
        status: 'RESERVED',
        execution: { id: '20202020-8888-4d02-bf25-6aeccf7ea419' },
      }),
      transition: jest.fn().mockResolvedValue(undefined),
      markOutcomeUncertain: jest.fn().mockResolvedValue(undefined),
      markSucceeded: jest.fn().mockResolvedValue(undefined),
      markDeadLettered: jest.fn().mockResolvedValue(undefined),
    };
    const workflowProviderCapabilityRegistryService = {
      resolve: jest.fn().mockReturnValue({
        providerClass: 'MessageCampaignEmail',
        supportsIdempotencyKey: false,
        supportsOutcomeReconciliation: false,
        maximumAutomaticAttempts: 1,
      }),
    };
    const messageCampaignPolicyService = {
      execute: jest.fn().mockImplementation(async ({ execute }) => ({
        value: await execute({
          rootCorrelationId: '20202020-eeee-4d02-bf25-6aeccf7ea419',
          policyDecisionId: CHILD_POLICY_DECISION_ID,
        }),
        rootCorrelationId: '20202020-eeee-4d02-bf25-6aeccf7ea419',
        policyDecisionId: CHILD_POLICY_DECISION_ID,
      })),
    };
    const { userWorkspaceService, workspaceCacheService } = buildService({
      currentRoleId: ORIGIN_ROLE_ID,
    });
    const service = Reflect.construct(MessageCampaignService, [
      {},
      emailingDomainSenderService,
      workspaceOrmManager,
      {},
      {},
      {},
      {
        getRoleIdForUserWorkspace: jest.fn().mockResolvedValue(ORIGIN_ROLE_ID),
      },
      {},
      {
        hasEmailCredits: jest.fn().mockResolvedValue(true),
        billSentEmails: jest.fn().mockResolvedValue(undefined),
      },
      { buildVariablesForPerson: jest.fn().mockResolvedValue({}) },
      {},
      userWorkspaceService,
      workspaceCacheService,
      workflowEffectService,
      workflowProviderCapabilityRegistryService,
      messageCampaignPolicyService,
    ]) as MessageCampaignService;
    const warnSpy = jest.spyOn(Logger.prototype, 'warn');
    const data: SendCampaignEmailJobData = {
      schemaVersion: 1,
      workspaceId: WORKSPACE_ID,
      userWorkspaceId: USER_WORKSPACE_ID,
      roleId: ORIGIN_ROLE_ID,
      rootCorrelationId: '20202020-eeee-4d02-bf25-6aeccf7ea419',
      parentPolicyDecisionId: PARENT_POLICY_DECISION_ID,
      campaignId: CAMPAIGN_ID,
      messageId,
      emailingDomainId: '20202020-9999-4d02-bf25-6aeccf7ea419',
    };

    await expect(service.processSendJob(data)).resolves.toBeUndefined();

    expect(emailingDomainSenderService.sendEmail).toHaveBeenCalledTimes(1);
    expect(workflowEffectService.markOutcomeUncertain).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      id: '20202020-8888-4d02-bf25-6aeccf7ea419',
      reason: 'CAMPAIGN_POST_PROVIDER_PERSISTENCE_UNCERTAIN',
    });
    expect(workflowEffectService.markSucceeded).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      'Campaign delivery persistence is uncertain and requires reconciliation.',
    );
  }, 15_000);
});
