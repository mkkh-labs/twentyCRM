import { msg } from '@lingui/core/macro';

import {
  type AllMetadataName,
  WorkspaceMigrationV2ExceptionCode,
} from 'twenty-shared/metadata';

import { WorkspaceMigrationV2Exception } from 'src/engine/workspace-manager/workspace-migration.exception';
import { type DestructiveMetadataChangeExecutionContext } from 'src/engine/workspace-manager/workspace-migration/types/destructive-metadata-change-execution-context.type';

export type DestructiveMetadataChangeAuthorization =
  | Readonly<{
      source: 'CHANGE_SET';
      workspaceId: string;
      changeSetId: string;
    }>
  | Readonly<{
      source: 'APPLICATION_MANIFEST';
      workspaceId: string;
      applicationUniversalIdentifier: string;
    }>
  | Readonly<{
      source: 'SYSTEM_BUILD';
      workspaceId: string;
      operationId: string;
    }>;

const CHANGE_SET_PROTECTED_METADATA_NAMES = new Set<AllMetadataName>([
  'fieldMetadata',
  'index',
  'objectMetadata',
]);

export const assertDestructiveMetadataChangeIsAuthorized = ({
  actions,
  applicationUniversalIdentifier,
  authorization,
  executionContext,
  isSystemBuild,
  workspaceId,
}: {
  actions: readonly Readonly<{
    type: string;
    metadataName: AllMetadataName;
  }>[];
  workspaceId: string;
  isSystemBuild: boolean;
  applicationUniversalIdentifier?: string;
  authorization: DestructiveMetadataChangeAuthorization | undefined;
  executionContext: DestructiveMetadataChangeExecutionContext | undefined;
}): void => {
  const hasDestructiveAction = actions.some(
    (action) =>
      action.type === 'delete' &&
      CHANGE_SET_PROTECTED_METADATA_NAMES.has(action.metadataName),
  );
  const hasInvalidChangeSetAuthorization =
    authorization?.source === 'CHANGE_SET' &&
    (executionContext?.source !== 'CHANGE_SET' ||
      executionContext.workspaceId !== workspaceId ||
      executionContext.changeSetId !== authorization.changeSetId);
  const hasInvalidSystemBuildAuthorization =
    authorization?.source === 'SYSTEM_BUILD' &&
    (!isSystemBuild ||
      authorization.operationId.length === 0 ||
      executionContext?.source !== 'SYSTEM_BUILD' ||
      executionContext.workspaceId !== workspaceId ||
      executionContext.operationId !== authorization.operationId);
  const hasInvalidApplicationManifestAuthorization =
    authorization?.source === 'APPLICATION_MANIFEST' &&
    (isSystemBuild ||
      applicationUniversalIdentifier === undefined ||
      authorization.applicationUniversalIdentifier !==
        applicationUniversalIdentifier ||
      executionContext?.source !== 'APPLICATION_MANIFEST' ||
      executionContext.workspaceId !== workspaceId ||
      executionContext.applicationUniversalIdentifier !==
        authorization.applicationUniversalIdentifier);
  const hasUnknownAuthorizationSource =
    authorization !== undefined &&
    authorization.source !== 'CHANGE_SET' &&
    authorization.source !== 'APPLICATION_MANIFEST' &&
    authorization.source !== 'SYSTEM_BUILD';

  if (
    hasDestructiveAction &&
    (authorization === undefined ||
      authorization.workspaceId !== workspaceId ||
      hasInvalidChangeSetAuthorization ||
      hasInvalidSystemBuildAuthorization ||
      hasInvalidApplicationManifestAuthorization ||
      hasUnknownAuthorizationSource)
  ) {
    throw new WorkspaceMigrationV2Exception(
      'Destructive metadata changes require explicit authorization.',
      WorkspaceMigrationV2ExceptionCode.CHANGE_SET_REQUIRED,
      {
        userFriendlyMessage: msg`Plan and approve this destructive metadata change before applying it.`,
      },
    );
  }
};
