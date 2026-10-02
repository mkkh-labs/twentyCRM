import { EmailComposerService } from 'src/engine/core-modules/tool/tools/email-tool/email-composer.service';

const WORKSPACE_ID = '20202020-1111-4111-8111-111111111111';
const USER_WORKSPACE_ID = '20202020-2222-4222-8222-222222222222';
const OTHER_USER_WORKSPACE_ID = '20202020-3333-4333-8333-333333333333';
const CONNECTED_ACCOUNT_ID = '20202020-4444-4444-8444-444444444444';

const parameters = {
  connectedAccountId: CONNECTED_ACCOUNT_ID,
  recipients: { to: 'recipient@example.com' },
  subject: 'Subject',
  body: 'Body',
};

describe('EmailComposerService authority boundary', () => {
  const connectedAccountRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
  };
  const workspaceOrmManager = {
    executeInWorkspaceContext: jest.fn((callback: () => unknown) => callback()),
  };
  const service = new EmailComposerService(
    workspaceOrmManager as never,
    connectedAccountRepository as never,
    { find: jest.fn() } as never,
    {} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('denies a caller-bound request for another member private account', async () => {
    connectedAccountRepository.findOne.mockResolvedValue({
      id: CONNECTED_ACCOUNT_ID,
      workspaceId: WORKSPACE_ID,
      userWorkspaceId: OTHER_USER_WORKSPACE_ID,
      visibility: 'user',
    });

    await expect(
      service.composeEmail(parameters, {
        workspaceId: WORKSPACE_ID,
        userWorkspaceId: USER_WORKSPACE_ID,
      }),
    ).rejects.toThrow(
      'No connected account available for the current authority',
    );

    expect(connectedAccountRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CONNECTED_ACCOUNT_ID, workspaceId: WORKSPACE_ID },
      }),
    );
  });

  it('denies a service request for a private account', async () => {
    connectedAccountRepository.findOne.mockResolvedValue({
      id: CONNECTED_ACCOUNT_ID,
      workspaceId: WORKSPACE_ID,
      userWorkspaceId: OTHER_USER_WORKSPACE_ID,
      visibility: 'user',
    });

    await expect(
      service.composeEmail(parameters, { workspaceId: WORKSPACE_ID }),
    ).rejects.toThrow(
      'No connected account available for the current authority',
    );
  });

  it('does not select a private account as a service default', async () => {
    connectedAccountRepository.find.mockResolvedValue([
      {
        id: CONNECTED_ACCOUNT_ID,
        userWorkspaceId: OTHER_USER_WORKSPACE_ID,
        visibility: 'user',
      },
    ]);

    await expect(
      service.composeEmail(
        { ...parameters, connectedAccountId: undefined },
        { workspaceId: WORKSPACE_ID },
      ),
    ).rejects.toThrow(
      'No connected account available for the current authority',
    );

    expect(connectedAccountRepository.findOne).not.toHaveBeenCalled();
  });
});
