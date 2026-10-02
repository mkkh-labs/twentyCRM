import { Injectable } from '@nestjs/common';

import { InjectCacheStorage } from 'src/engine/core-modules/cache-storage/decorators/cache-storage.decorator';
import { CacheStorageService } from 'src/engine/core-modules/cache-storage/services/cache-storage.service';
import { CacheStorageNamespace } from 'src/engine/core-modules/cache-storage/types/cache-storage-namespace.enum';
import { PromiseMemoizer } from 'src/engine/twenty-orm/storage/promise-memoizer.storage';
import { type CacheKey } from 'src/engine/twenty-orm/storage/types/cache-key.type';

export const APPLICATION_KILL_SWITCH_LOCAL_CACHE_TTL_MS = 60_000;

type ApplicationKillSwitchCacheEntry = {
  isStopped: boolean;
};

@Injectable()
export class ApplicationStopService {
  private readonly memoizer =
    new PromiseMemoizer<ApplicationKillSwitchCacheEntry>(
      APPLICATION_KILL_SWITCH_LOCAL_CACHE_TTL_MS,
    );

  constructor(
    @InjectCacheStorage(CacheStorageNamespace.ModuleApplications)
    private readonly cacheStorageService: CacheStorageService,
  ) {}

  async stop(
    applicationUniversalIdentifier: string,
    workspaceId?: string,
  ): Promise<void> {
    await this.cacheStorageService.set(
      this.getKillSwitchKey(applicationUniversalIdentifier, workspaceId),
      'stopped',
    );
    await this.memoizer.clearKey(
      this.getMemoizerKey(applicationUniversalIdentifier, workspaceId),
    );
  }

  async remove(
    applicationUniversalIdentifier: string,
    workspaceId?: string,
  ): Promise<void> {
    if (workspaceId === undefined) {
      await Promise.all([
        this.cacheStorageService.del(
          this.getKillSwitchKey(applicationUniversalIdentifier),
        ),
        this.cacheStorageService.del(
          this.getLegacyGlobalKillSwitchKey(applicationUniversalIdentifier),
        ),
      ]);
    } else {
      await this.cacheStorageService.del(
        this.getKillSwitchKey(applicationUniversalIdentifier, workspaceId),
      );
    }
    await this.memoizer.clearKey(
      this.getMemoizerKey(applicationUniversalIdentifier, workspaceId),
    );
  }

  async isApplicationStopped(
    applicationUniversalIdentifier: string,
    workspaceId?: string,
  ): Promise<boolean> {
    const globalEntry = await this.memoizer.memoizePromiseAndExecute(
      this.getMemoizerKey(applicationUniversalIdentifier),
      () => this.readGlobalKillSwitch(applicationUniversalIdentifier),
    );

    if (globalEntry?.isStopped ?? true) {
      return true;
    }

    if (workspaceId === undefined) {
      return false;
    }

    const workspaceEntry = await this.memoizer.memoizePromiseAndExecute(
      this.getMemoizerKey(applicationUniversalIdentifier, workspaceId),
      () =>
        this.readWorkspaceKillSwitch(
          applicationUniversalIdentifier,
          workspaceId,
        ),
    );

    return workspaceEntry?.isStopped ?? true;
  }

  private async readGlobalKillSwitch(
    applicationUniversalIdentifier: string,
  ): Promise<ApplicationKillSwitchCacheEntry> {
    try {
      const [currentState, legacyState] = await Promise.all([
        this.cacheStorageService.get(
          this.getKillSwitchKey(applicationUniversalIdentifier),
        ),
        this.cacheStorageService.get(
          this.getLegacyGlobalKillSwitchKey(applicationUniversalIdentifier),
        ),
      ]);

      return {
        isStopped: currentState !== undefined || legacyState !== undefined,
      };
    } catch {
      return { isStopped: true };
    }
  }

  private async readWorkspaceKillSwitch(
    applicationUniversalIdentifier: string,
    workspaceId: string,
  ): Promise<ApplicationKillSwitchCacheEntry> {
    try {
      return {
        isStopped:
          (await this.cacheStorageService.get(
            this.getKillSwitchKey(applicationUniversalIdentifier, workspaceId),
          )) !== undefined,
      };
    } catch {
      return { isStopped: true };
    }
  }

  private getKillSwitchKey(
    applicationUniversalIdentifier: string,
    workspaceId?: string,
  ): string {
    return workspaceId === undefined
      ? `kill-switch:global:${applicationUniversalIdentifier}`
      : `kill-switch:workspace:${workspaceId}:${applicationUniversalIdentifier}`;
  }

  private getLegacyGlobalKillSwitchKey(
    applicationUniversalIdentifier: string,
  ): string {
    return `kill-switch:${applicationUniversalIdentifier}`;
  }

  private getMemoizerKey(
    applicationUniversalIdentifier: string,
    workspaceId?: string,
  ): CacheKey {
    return workspaceId === undefined
      ? `application-global-${applicationUniversalIdentifier}`
      : `application-workspace-${workspaceId}-${applicationUniversalIdentifier}`;
  }
}
