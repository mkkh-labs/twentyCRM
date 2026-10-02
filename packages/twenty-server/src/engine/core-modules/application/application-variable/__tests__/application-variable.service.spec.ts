import { ApplicationVariableEntityService } from 'src/engine/core-modules/application/application-variable/application-variable.service';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const APPLICATION_ID = '22222222-2222-4222-8222-222222222222';

describe('ApplicationVariableEntityService', () => {
  it('never decrypts secret variables for front-component public context', async () => {
    const decryptVersionedOrThrow = jest.fn((value: string) =>
      value === 'enc:v2:public' ? 'public-value' : 'secret-value',
    );
    const workspaceCacheService = {
      getOrRecompute: jest.fn().mockResolvedValue({
        applicationVariableMaps: {
          universalIdentifiersByApplicationId: {
            [APPLICATION_ID]: ['public-variable', 'secret-variable'],
          },
          byUniversalIdentifier: {
            'public-variable': {
              universalIdentifier: 'public-variable',
              workspaceId: WORKSPACE_ID,
              applicationId: APPLICATION_ID,
              key: 'PUBLIC_VALUE',
              value: 'enc:v2:public',
              isSecret: false,
            },
            'secret-variable': {
              universalIdentifier: 'secret-variable',
              workspaceId: WORKSPACE_ID,
              applicationId: APPLICATION_ID,
              key: 'SECRET_VALUE',
              value: 'enc:v2:secret',
              isSecret: true,
            },
          },
        },
      }),
    };
    const service = new ApplicationVariableEntityService(
      {} as never,
      workspaceCacheService as never,
      { decryptVersionedOrThrow } as never,
    );

    await expect(
      service.getPublicEnvVariables({
        workspaceId: WORKSPACE_ID,
        applicationId: APPLICATION_ID,
      }),
    ).resolves.toEqual({ PUBLIC_VALUE: 'public-value' });
    expect(decryptVersionedOrThrow).toHaveBeenCalledTimes(1);
    expect(decryptVersionedOrThrow).not.toHaveBeenCalledWith(
      'enc:v2:secret',
      expect.anything(),
    );
  });
});
