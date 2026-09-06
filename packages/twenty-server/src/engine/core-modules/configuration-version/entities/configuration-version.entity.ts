import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  Unique,
} from 'typeorm';

import { type ConfigurationSnapshot } from 'src/engine/core-modules/configuration-version/utils/diff-configuration-snapshots.util';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';

@Unique('UQ_CONFIGURATION_VERSION_WORKSPACE_METADATA', [
  'workspaceId',
  'metadataVersion',
])
@Index('IDX_CONFIGURATION_VERSION_WORKSPACE_CREATED', [
  'workspaceId',
  'createdAt',
])
@Check(
  'CHK_CONFIGURATION_VERSION_SNAPSHOT_DIGEST',
  '"snapshotDigest" ~ \'^[a-f0-9]{64}$\'',
)
@Entity({ name: 'configurationVersion', schema: 'core' })
export class ConfigurationVersionEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'integer' })
  metadataVersion: number;

  @Column({ type: 'varchar', length: 32 })
  platformVersion: string;

  @Column({ type: 'uuid', nullable: true })
  changeSetId: string | null;

  @Column({ type: 'jsonb' })
  snapshot: ConfigurationSnapshot;

  @Column({ type: 'char', length: 64 })
  snapshotDigest: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
