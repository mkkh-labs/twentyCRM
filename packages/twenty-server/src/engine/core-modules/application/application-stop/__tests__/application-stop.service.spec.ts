import { ApplicationStopService } from 'src/engine/core-modules/application/application-stop/application-stop.service';
import { type CacheStorageService } from 'src/engine/core-modules/cache-storage/services/cache-storage.service';

const APPLICATION_ID = 'application-id';
const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';

const createService = () => {
  const cacheStorageService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  } as unknown as jest.Mocked<CacheStorageService>;

  return {
    cacheStorageService,
    service: new ApplicationStopService(cacheStorageService),
  };
};

describe('ApplicationStopService', () => {
  it('fails closed when the distributed kill-switch state is unavailable', async () => {
    const { cacheStorageService, service } = createService();

    cacheStorageService.get.mockRejectedValue(new Error('cache unavailable'));

    await expect(service.isApplicationStopped(APPLICATION_ID)).resolves.toBe(
      true,
    );
  });

  it('invalidates a cached allow immediately after stop', async () => {
    const { cacheStorageService, service } = createService();

    cacheStorageService.get.mockResolvedValue(undefined);

    await expect(service.isApplicationStopped(APPLICATION_ID)).resolves.toBe(
      false,
    );
    await service.stop(APPLICATION_ID);
    cacheStorageService.get.mockImplementation(async (key) =>
      key === `kill-switch:global:${APPLICATION_ID}` ? 'stopped' : undefined,
    );
    await expect(service.isApplicationStopped(APPLICATION_ID)).resolves.toBe(
      true,
    );
    expect(cacheStorageService.get).toHaveBeenCalledTimes(4);
  });

  it('invalidates a cached denial after an explicit removal', async () => {
    const { cacheStorageService, service } = createService();

    cacheStorageService.get.mockImplementation(async (key) =>
      key === `kill-switch:global:${APPLICATION_ID}` ? 'stopped' : undefined,
    );

    await expect(service.isApplicationStopped(APPLICATION_ID)).resolves.toBe(
      true,
    );
    await service.remove(APPLICATION_ID);
    cacheStorageService.get.mockResolvedValue(undefined);
    await expect(service.isApplicationStopped(APPLICATION_ID)).resolves.toBe(
      false,
    );
    expect(cacheStorageService.get).toHaveBeenCalledTimes(4);
  });

  it('isolates a workspace uninstall stop from other workspaces', async () => {
    const { cacheStorageService, service } = createService();

    cacheStorageService.get.mockImplementation(async (key) =>
      key === `kill-switch:workspace:${WORKSPACE_ID}:${APPLICATION_ID}`
        ? 'stopped'
        : undefined,
    );

    await expect(
      service.isApplicationStopped(APPLICATION_ID, WORKSPACE_ID),
    ).resolves.toBe(true);
    await expect(
      service.isApplicationStopped(APPLICATION_ID, OTHER_WORKSPACE_ID),
    ).resolves.toBe(false);
  });

  it('applies a global stop to every workspace', async () => {
    const { cacheStorageService, service } = createService();

    cacheStorageService.get.mockImplementation(async (key) =>
      key === `kill-switch:global:${APPLICATION_ID}` ? 'stopped' : undefined,
    );

    await expect(
      service.isApplicationStopped(APPLICATION_ID, WORKSPACE_ID),
    ).resolves.toBe(true);
    await expect(
      service.isApplicationStopped(APPLICATION_ID, OTHER_WORKSPACE_ID),
    ).resolves.toBe(true);
  });

  it('honors the legacy global key during a rolling upgrade', async () => {
    const { cacheStorageService, service } = createService();

    cacheStorageService.get.mockImplementation(async (key) =>
      key === `kill-switch:${APPLICATION_ID}` ? 'stopped' : undefined,
    );

    await expect(
      service.isApplicationStopped(APPLICATION_ID, WORKSPACE_ID),
    ).resolves.toBe(true);
  });

  it('writes a workspace-bound stop without changing the global key', async () => {
    const { cacheStorageService, service } = createService();

    await service.stop(APPLICATION_ID, WORKSPACE_ID);

    expect(cacheStorageService.set).toHaveBeenCalledWith(
      `kill-switch:workspace:${WORKSPACE_ID}:${APPLICATION_ID}`,
      'stopped',
    );
    expect(cacheStorageService.set).not.toHaveBeenCalledWith(
      `kill-switch:global:${APPLICATION_ID}`,
      expect.anything(),
    );
  });
});
