import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

import { type MetadataChangeSetState } from 'src/engine/core-modules/metadata-change-set/types/metadata-change-set-state.type';
import { type AllFlatEntityOperationRecordByMetadataName } from 'src/engine/metadata-modules/flat-entity/types/all-flat-entity-operation-record-by-metadata-name.type';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';

export type MetadataChangeOperation = Readonly<{
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  metadataType: string;
  universalIdentifier: string;
  payloadDigest: string;
}>;

export type MetadataDependencyImpact = Readonly<{
  workflows: readonly string[];
  views: readonly string[];
  applications: readonly string[];
  contracts: readonly string[];
  metadata: readonly string[];
}>;

export type MetadataChangeSetRiskClass = 'R1' | 'R2' | 'R3';

export type MetadataChangeSetRecoveryStrategy = 'ROLLBACK' | 'FORWARD_FIX';

@Index('IDX_METADATA_CHANGE_SET_WORKSPACE_STATE', ['workspaceId', 'state'])
@Check('CHK_METADATA_CHANGE_SET_BASE_VERSION', '"baseMetadataVersion" >= 0')
@Entity({ name: 'metadataChangeSet', schema: 'core' })
export class MetadataChangeSetEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'varchar', length: 32 })
  state: MetadataChangeSetState;

  @Column({ type: 'integer' })
  baseMetadataVersion: number;

  @Column({ type: 'jsonb' })
  operations: MetadataChangeOperation[];

  @Column({ type: 'jsonb', nullable: true })
  migrationPlan: AllFlatEntityOperationRecordByMetadataName | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  applicationUniversalIdentifier: string | null;

  @Column({ type: 'jsonb', nullable: true })
  rollbackPlan: AllFlatEntityOperationRecordByMetadataName | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  recoveryStrategy: MetadataChangeSetRecoveryStrategy | null;

  @Column({ type: 'char', length: 64, nullable: true })
  dependencyResolutionDigest: string | null;

  @Column({ type: 'char', length: 64, nullable: true })
  applyTokenDigest: string | null;

  @Column({ type: 'uuid', nullable: true })
  approvalId: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  approvalAction: string | null;

  @Column({ type: 'char', length: 64, nullable: true })
  approvalActionDigest: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  approvalExpiresAt: Date | null;

  @Column({ type: 'varchar', length: 2, nullable: true })
  riskClass: MetadataChangeSetRiskClass | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  compatibilityFindings: string[];

  @Column({ type: 'integer', nullable: true })
  appliedMetadataVersion: number | null;

  @Column({ type: 'jsonb' })
  dependencyImpact: MetadataDependencyImpact;

  @Column({ type: 'uuid' })
  createdByActorId: string;

  @Column({ type: 'uuid', nullable: true })
  approvedByActorId: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  failureCode: string | null;

  @VersionColumn({ type: 'integer' })
  version: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
