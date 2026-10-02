import { WorkspaceSetupChatOutcome } from 'src/engine/metadata-modules/ai/ai-chat/enums/workspace-setup-chat-outcome.enum';
import { WorkspaceSetupChatService } from 'src/engine/metadata-modules/ai/ai-chat/services/workspace-setup-chat.service';

describe('WorkspaceSetupChatService authority boundary', () => {
  const buildDependencies = () => {
    const twentyConfigService = {
      get: jest.fn().mockReturnValue(true),
    };
    const billingUsageService = {
      hasAvailableCredits: jest.fn().mockResolvedValue(true),
    };
    const aiModelRegistryService = {
      getAvailableModels: jest.fn().mockReturnValue([{ id: 'model-1' }]),
    };
    const userWorkspaceService = {
      isWorkspaceCreator: jest.fn().mockResolvedValue(true),
    };
    const i18nService = {
      getI18nInstance: jest.fn().mockReturnValue({
        _: jest.fn().mockReturnValue('Workspace setup'),
      }),
    };
    const agentChatService = {
      findThreadById: jest.fn().mockResolvedValue(null),
      createThread: jest.fn().mockResolvedValue({
        id: 'thread-1',
        activeStreamId: null,
        deletedAt: null,
      }),
    };
    const agentChatStreamingService = {
      startHiddenKickoffStream: jest.fn().mockResolvedValue(null),
    };
    const workspaceCacheService = {
      getOrRecompute: jest.fn().mockResolvedValue({
        flatWorkspaceMemberMaps: {
          idByUserId: { 'user-1': 'workspace-member-1' },
          byId: {
            'workspace-member-1': {
              id: 'workspace-member-1',
              userId: 'user-1',
              locale: 'fr-FR',
              deletedAt: null,
            },
          },
        },
      }),
    };

    return {
      twentyConfigService,
      billingUsageService,
      aiModelRegistryService,
      userWorkspaceService,
      i18nService,
      agentChatService,
      agentChatStreamingService,
      workspaceCacheService,
    };
  };

  const startChat = async (
    dependencies: ReturnType<typeof buildDependencies>,
  ) => {
    const service = new WorkspaceSetupChatService(
      dependencies.twentyConfigService as never,
      dependencies.billingUsageService as never,
      dependencies.aiModelRegistryService as never,
      dependencies.userWorkspaceService as never,
      dependencies.i18nService as never,
      dependencies.agentChatService as never,
      dependencies.agentChatStreamingService as never,
      dependencies.workspaceCacheService as never,
    );

    return service.startWorkspaceSetupChat({
      userId: 'user-1',
      userEmail: 'jane@example.com',
      userLocale: 'en',
      userWorkspaceId: 'user-workspace-1',
      workspace: {
        id: 'workspace-1',
        displayName: 'Acme',
        subdomain: 'acme',
        fastModel: 'model-1',
      } as never,
      companyContext: null,
      personContext: null,
    });
  };

  it('uses the active tenant-bound workspace member locale', async () => {
    const dependencies = buildDependencies();

    await expect(startChat(dependencies)).resolves.toMatchObject({
      outcome: WorkspaceSetupChatOutcome.ALREADY_STARTED,
    });

    expect(
      dependencies.workspaceCacheService.getOrRecompute,
    ).toHaveBeenCalledWith('workspace-1', ['flatWorkspaceMemberMaps']);
    expect(dependencies.i18nService.getI18nInstance).toHaveBeenCalledWith(
      'fr-FR',
    );
  });

  it.each([
    {
      label: 'deleted',
      workspaceMember: {
        id: 'workspace-member-1',
        userId: 'user-1',
        locale: 'fr-FR',
        deletedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    },
    {
      label: 'bound to another user',
      workspaceMember: {
        id: 'workspace-member-1',
        userId: 'user-foreign',
        locale: 'fr-FR',
        deletedAt: null,
      },
    },
  ])(
    'falls back to the user locale for a $label cache identity',
    async ({ workspaceMember }) => {
      const dependencies = buildDependencies();

      dependencies.workspaceCacheService.getOrRecompute.mockResolvedValue({
        flatWorkspaceMemberMaps: {
          idByUserId: { 'user-1': 'workspace-member-1' },
          byId: { 'workspace-member-1': workspaceMember },
        },
      });

      await expect(startChat(dependencies)).resolves.toMatchObject({
        outcome: WorkspaceSetupChatOutcome.ALREADY_STARTED,
      });

      expect(dependencies.i18nService.getI18nInstance).toHaveBeenCalledWith(
        'en',
      );
    },
  );
});
