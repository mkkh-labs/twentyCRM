import { Injectable } from '@nestjs/common';

import {
  ALL_METADATA_NAME,
  type AllMetadataName,
} from 'twenty-shared/metadata';
import { isPlainObject } from 'twenty-shared/utils';

import { type ConfigurationSnapshot } from 'src/engine/core-modules/configuration-version/utils/diff-configuration-snapshots.util';
import { buildDeterministicDigest } from 'src/engine/core-modules/policy/utils/build-deterministic-digest.util';
import { WorkspaceManyOrAllFlatEntityMapsCacheService } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.service';
import { getMetadataFlatEntityMapsKey } from 'src/engine/metadata-modules/flat-entity/utils/get-metadata-flat-entity-maps-key.util';

@Injectable()
export class ConfigurationSnapshotService {
  constructor(
    private readonly cacheService: WorkspaceManyOrAllFlatEntityMapsCacheService,
  ) {}

  async build(workspaceId: string): Promise<ConfigurationSnapshot> {
    const flatMaps =
      await this.cacheService.getOrRecomputeManyOrAllFlatEntityMaps({
        workspaceId,
      });
    const entries: Record<string, ConfigurationSnapshot['entries'][string]> =
      {};

    for (const metadataName of Object.keys(ALL_METADATA_NAME).sort()) {
      const typedMetadataName = metadataName as AllMetadataName;
      const flatMapsKey = getMetadataFlatEntityMapsKey(typedMetadataName);
      const flatEntityMaps = flatMaps[flatMapsKey] as unknown;

      if (!isPlainObject(flatEntityMaps)) {
        throw new Error('Configuration metadata map is unavailable.');
      }

      const byUniversalIdentifier = flatEntityMaps.byUniversalIdentifier;

      if (!isPlainObject(byUniversalIdentifier)) {
        throw new Error('Configuration metadata map is malformed.');
      }

      for (const [universalIdentifier, entity] of Object.entries(
        byUniversalIdentifier,
      ).sort(([left], [right]) => left.localeCompare(right))) {
        if (
          !isPlainObject(entity) ||
          entity.universalIdentifier !== universalIdentifier
        ) {
          throw new Error(
            'Configuration metadata universal identifier is mismatched.',
          );
        }

        entries[`${typedMetadataName}:${universalIdentifier}`] = {
          metadataName: typedMetadataName,
          universalIdentifier,
          contentDigest: buildDeterministicDigest(entity),
        };
      }
    }

    return { schemaVersion: 1, entries };
  }
}
