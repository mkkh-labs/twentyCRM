import { UseGuards } from '@nestjs/common';
import { Args, Int, Query } from '@nestjs/graphql';

import GraphQLJSON from 'graphql-type-json';
import { PermissionFlagType } from 'twenty-shared/constants';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';

import { ConfigurationVersionService } from 'src/engine/core-modules/configuration-version/services/configuration-version.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { RequireAccessTokenGuard } from 'src/engine/guards/require-access-token.guard';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';

@MetadataResolver()
@UseGuards(
  UserAuthGuard,
  WorkspaceAuthGuard,
  RequireAccessTokenGuard,
  SettingsPermissionGuard(PermissionFlagType.DATA_MODEL),
)
export class ConfigurationVersionResolver {
  constructor(
    private readonly configurationVersionService: ConfigurationVersionService,
  ) {}

  @Query(() => GraphQLJSON)
  async configurationVersions(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('limit', { type: () => Int, defaultValue: 50 }) limit: number,
  ) {
    const versions = await this.configurationVersionService.list({
      workspaceId: workspace.id,
      limit,
    });

    return versions.map((version) => ({
      id: version.id,
      metadataVersion: version.metadataVersion,
      platformVersion: version.platformVersion,
      changeSetId: version.changeSetId,
      snapshotDigest: version.snapshotDigest,
      createdAt: version.createdAt,
    }));
  }

  @Query(() => GraphQLJSON)
  configurationVersionDiff(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @Args('fromVersionId') fromVersionId: string,
    @Args('toVersionId') toVersionId: string,
  ) {
    return this.configurationVersionService.compare({
      workspaceId: workspace.id,
      fromVersionId,
      toVersionId,
    });
  }
}
