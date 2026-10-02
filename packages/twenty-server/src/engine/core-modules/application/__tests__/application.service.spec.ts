import { ApplicationService } from 'src/engine/core-modules/application/application.service';

const APPLICATION_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const ROLE_ID = '33333333-3333-4333-8333-333333333333';

const buildService = ({
  role,
}: {
  role?: Readonly<{
    id: string;
    workspaceId: string;
    applicationId: string;
  }>;
}) =>
  Object.assign(Object.create(ApplicationService.prototype), {
    applicationRepository: {
      findOne: jest.fn().mockResolvedValue({
        id: APPLICATION_ID,
        workspaceId: WORKSPACE_ID,
        defaultRoleId: ROLE_ID,
      }),
    },
    workspaceCacheService: {
      getOrRecompute: jest.fn().mockResolvedValue({
        flatRoleMaps: {
          universalIdentifierById:
            role === undefined ? {} : { [role.id]: 'role-universal-id' },
          byUniversalIdentifier:
            role === undefined ? {} : { 'role-universal-id': role },
        },
      }),
    },
  }) as ApplicationService;

describe('ApplicationService.findApplicationRoleId', () => {
  it('returns a current role bound to the same workspace and application', async () => {
    const service = buildService({
      role: {
        id: ROLE_ID,
        workspaceId: WORKSPACE_ID,
        applicationId: APPLICATION_ID,
      },
    });

    await expect(
      service.findApplicationRoleId(APPLICATION_ID, WORKSPACE_ID),
    ).resolves.toBe(ROLE_ID);
  });

  it.each([
    ['missing', undefined],
    [
      'foreign workspace',
      {
        id: ROLE_ID,
        workspaceId: '22222222-2222-4222-8222-222222222299',
        applicationId: APPLICATION_ID,
      },
    ],
    [
      'foreign application',
      {
        id: ROLE_ID,
        workspaceId: WORKSPACE_ID,
        applicationId: '11111111-1111-4111-8111-111111111199',
      },
    ],
  ])('denies a %s default role binding', async (_, role) => {
    const service = buildService({ role });

    await expect(
      service.findApplicationRoleId(APPLICATION_ID, WORKSPACE_ID),
    ).rejects.toThrow(`Could not find application ${APPLICATION_ID}`);
  });
});
