import { basename } from 'path';

import { type WorkspacePortableExportManifest } from 'src/database/commands/workspace-export/types/workspace-portable-export-manifest.type';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX_16_BYTE_PATTERN = /^[0-9a-f]{32}$/i;
const HEX_12_BYTE_PATTERN = /^[0-9a-f]{24}$/i;
const SHA_256_PATTERN = /^[0-9a-f]{64}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const assertString: (
  value: unknown,
  fieldName: string,
) => asserts value is string = (value, fieldName) => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid workspace export manifest ${fieldName}.`);
  }
};

export const validateWorkspacePortableExportManifest = (
  candidate: unknown,
  supportedPlatformVersion: string,
): WorkspacePortableExportManifest => {
  if (!isRecord(candidate) || candidate.schemaVersion !== 1) {
    throw new Error('Unsupported workspace export manifest schemaVersion.');
  }

  assertString(candidate.exportId, 'exportId');
  assertString(candidate.rootCorrelationId, 'rootCorrelationId');

  if (
    !UUID_PATTERN.test(candidate.exportId) ||
    !UUID_PATTERN.test(candidate.rootCorrelationId)
  ) {
    throw new Error('Invalid workspace export correlation binding.');
  }

  assertString(candidate.platformVersion, 'platformVersion');

  if (candidate.platformVersion !== supportedPlatformVersion) {
    throw new Error(
      `Workspace export platformVersion ${candidate.platformVersion} is not supported by ${supportedPlatformVersion}.`,
    );
  }

  assertString(candidate.workspaceId, 'workspaceId');

  if (!UUID_PATTERN.test(candidate.workspaceId)) {
    throw new Error('Invalid workspace export manifest workspaceId.');
  }

  assertString(candidate.workspaceSchemaName, 'workspaceSchemaName');

  if (
    candidate.workspaceSchemaName !==
    getWorkspaceSchemaName(candidate.workspaceId)
  ) {
    throw new Error('Workspace export schema does not match its workspaceId.');
  }

  assertString(candidate.createdAt, 'createdAt');

  if (new Date(candidate.createdAt).toISOString() !== candidate.createdAt) {
    throw new Error('Invalid workspace export manifest createdAt.');
  }

  if (candidate.configurationVersion !== null) {
    if (!isRecord(candidate.configurationVersion)) {
      throw new Error('Invalid workspace export configurationVersion.');
    }

    assertString(candidate.configurationVersion.id, 'configurationVersion.id');
    assertString(
      candidate.configurationVersion.snapshotDigest,
      'configurationVersion.snapshotDigest',
    );

    if (
      !UUID_PATTERN.test(candidate.configurationVersion.id) ||
      !SHA_256_PATTERN.test(candidate.configurationVersion.snapshotDigest)
    ) {
      throw new Error('Invalid workspace export configurationVersion binding.');
    }
  }

  if (
    !isRecord(candidate.scope) ||
    candidate.scope.type !== 'FULL' ||
    !Array.isArray(candidate.scope.tables) ||
    candidate.scope.tables.length !== 0
  ) {
    throw new Error('Only full workspace exports can be imported.');
  }

  if (!isRecord(candidate.artifact)) {
    throw new Error('Invalid workspace export artifact contract.');
  }

  const { artifact } = candidate;

  assertString(artifact.fileName, 'artifact.fileName');
  assertString(artifact.salt, 'artifact.salt');
  assertString(artifact.initializationVector, 'artifact.initializationVector');
  assertString(artifact.authenticationTag, 'artifact.authenticationTag');
  assertString(artifact.sha256, 'artifact.sha256');

  if (
    basename(artifact.fileName) !== artifact.fileName ||
    artifact.fileName.includes('\\') ||
    artifact.cipher !== 'AES-256-GCM' ||
    artifact.keyDerivation !== 'SCRYPT' ||
    artifact.containsSensitiveData !== true ||
    !HEX_16_BYTE_PATTERN.test(artifact.salt) ||
    !HEX_12_BYTE_PATTERN.test(artifact.initializationVector) ||
    !HEX_16_BYTE_PATTERN.test(artifact.authenticationTag) ||
    !SHA_256_PATTERN.test(artifact.sha256)
  ) {
    throw new Error('Invalid workspace export encrypted artifact binding.');
  }

  return candidate as WorkspacePortableExportManifest;
};
