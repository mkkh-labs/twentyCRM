import { WorkspaceMigrationV2ExceptionCode } from 'twenty-shared/metadata';

import { assertDestructiveMetadataChangeIsAuthorized } from 'src/engine/workspace-manager/workspace-migration/utils/assert-destructive-metadata-change-is-authorized.util';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';

describe('assertDestructiveMetadataChangeIsAuthorized', () => {
  it('allows non-destructive metadata actions without mutation authorization', () => {
    expect(() =>
      assertDestructiveMetadataChangeIsAuthorized({
        actions: [
          { type: 'create', metadataName: 'objectMetadata' },
          { type: 'update', metadataName: 'fieldMetadata' },
        ],
        workspaceId: WORKSPACE_ID,
        isSystemBuild: false,
        authorization: undefined,
        executionContext: undefined,
      }),
    ).not.toThrow();
  });

  it('denies a destructive mutation without explicit authorization', () => {
    expect(() =>
      assertDestructiveMetadataChangeIsAuthorized({
        actions: [{ type: 'delete', metadataName: 'objectMetadata' }],
        workspaceId: WORKSPACE_ID,
        isSystemBuild: false,
        authorization: undefined,
        executionContext: undefined,
      }),
    ).toThrow(
      expect.objectContaining({
        code: WorkspaceMigrationV2ExceptionCode.CHANGE_SET_REQUIRED,
      }),
    );
  });

  it('denies authorization from another workspace', () => {
    expect(() =>
      assertDestructiveMetadataChangeIsAuthorized({
        actions: [{ type: 'delete', metadataName: 'fieldMetadata' }],
        workspaceId: WORKSPACE_ID,
        isSystemBuild: false,
        authorization: {
          source: 'CHANGE_SET',
          workspaceId: '22222222-2222-4222-8222-222222222222',
          changeSetId: '33333333-3333-4333-8333-333333333333',
        },
        executionContext: {
          source: 'CHANGE_SET',
          workspaceId: '22222222-2222-4222-8222-222222222222',
          changeSetId: '33333333-3333-4333-8333-333333333333',
        },
      }),
    ).toThrow(
      expect.objectContaining({
        code: WorkspaceMigrationV2ExceptionCode.CHANGE_SET_REQUIRED,
      }),
    );
  });

  it('denies a change-set authorization outside its execution context', () => {
    expect(() =>
      assertDestructiveMetadataChangeIsAuthorized({
        actions: [{ type: 'delete', metadataName: 'index' }],
        workspaceId: WORKSPACE_ID,
        isSystemBuild: false,
        authorization: {
          source: 'CHANGE_SET',
          workspaceId: WORKSPACE_ID,
          changeSetId: '33333333-3333-4333-8333-333333333333',
        },
        executionContext: undefined,
      }),
    ).toThrow(
      expect.objectContaining({
        code: WorkspaceMigrationV2ExceptionCode.CHANGE_SET_REQUIRED,
      }),
    );
  });

  it('denies a forged system-build authorization', () => {
    expect(() =>
      assertDestructiveMetadataChangeIsAuthorized({
        actions: [{ type: 'delete', metadataName: 'objectMetadata' }],
        workspaceId: WORKSPACE_ID,
        isSystemBuild: false,
        authorization: {
          source: 'SYSTEM_BUILD',
          workspaceId: WORKSPACE_ID,
          operationId: 'workspace-upgrade',
        },
        executionContext: undefined,
      }),
    ).toThrow(
      expect.objectContaining({
        code: WorkspaceMigrationV2ExceptionCode.CHANGE_SET_REQUIRED,
      }),
    );
  });

  it('denies an application authorization bound to another manifest', () => {
    expect(() =>
      assertDestructiveMetadataChangeIsAuthorized({
        actions: [{ type: 'delete', metadataName: 'fieldMetadata' }],
        workspaceId: WORKSPACE_ID,
        isSystemBuild: false,
        applicationUniversalIdentifier: '44444444-4444-4444-8444-444444444444',
        authorization: {
          source: 'APPLICATION_MANIFEST',
          workspaceId: WORKSPACE_ID,
          applicationUniversalIdentifier:
            '55555555-5555-4555-8555-555555555555',
        },
        executionContext: undefined,
      }),
    ).toThrow(
      expect.objectContaining({
        code: WorkspaceMigrationV2ExceptionCode.CHANGE_SET_REQUIRED,
      }),
    );
  });

  it('denies an unknown authorization source at runtime', () => {
    expect(() =>
      assertDestructiveMetadataChangeIsAuthorized({
        actions: [{ type: 'delete', metadataName: 'index' }],
        workspaceId: WORKSPACE_ID,
        isSystemBuild: false,
        authorization: {
          source: 'UNKNOWN',
          workspaceId: WORKSPACE_ID,
        } as never,
        executionContext: undefined,
      }),
    ).toThrow(
      expect.objectContaining({
        code: WorkspaceMigrationV2ExceptionCode.CHANGE_SET_REQUIRED,
      }),
    );
  });

  it('allows a change set bound to the active execution context', () => {
    const changeSetId = '33333333-3333-4333-8333-333333333333';

    expect(() =>
      assertDestructiveMetadataChangeIsAuthorized({
        actions: [{ type: 'delete', metadataName: 'objectMetadata' }],
        workspaceId: WORKSPACE_ID,
        isSystemBuild: false,
        authorization: {
          source: 'CHANGE_SET',
          workspaceId: WORKSPACE_ID,
          changeSetId,
        },
        executionContext: {
          source: 'CHANGE_SET',
          workspaceId: WORKSPACE_ID,
          changeSetId,
        },
      }),
    ).not.toThrow();
  });

  it('denies a system build outside its active execution context', () => {
    expect(() =>
      assertDestructiveMetadataChangeIsAuthorized({
        actions: [{ type: 'delete', metadataName: 'fieldMetadata' }],
        workspaceId: WORKSPACE_ID,
        isSystemBuild: true,
        authorization: {
          source: 'SYSTEM_BUILD',
          workspaceId: WORKSPACE_ID,
          operationId: 'workspace-upgrade',
        },
        executionContext: undefined,
      }),
    ).toThrow(
      expect.objectContaining({
        code: WorkspaceMigrationV2ExceptionCode.CHANGE_SET_REQUIRED,
      }),
    );
  });

  it('denies an application-manifest migration outside its active context', () => {
    const applicationUniversalIdentifier =
      '44444444-4444-4444-8444-444444444444';

    expect(() =>
      assertDestructiveMetadataChangeIsAuthorized({
        actions: [{ type: 'delete', metadataName: 'index' }],
        workspaceId: WORKSPACE_ID,
        isSystemBuild: false,
        applicationUniversalIdentifier,
        authorization: {
          source: 'APPLICATION_MANIFEST',
          workspaceId: WORKSPACE_ID,
          applicationUniversalIdentifier,
        },
        executionContext: undefined,
      }),
    ).toThrow(
      expect.objectContaining({
        code: WorkspaceMigrationV2ExceptionCode.CHANGE_SET_REQUIRED,
      }),
    );
  });

  it('allows a system build bound to the active execution context', () => {
    expect(() =>
      assertDestructiveMetadataChangeIsAuthorized({
        actions: [{ type: 'delete', metadataName: 'objectMetadata' }],
        workspaceId: WORKSPACE_ID,
        isSystemBuild: true,
        authorization: {
          source: 'SYSTEM_BUILD',
          workspaceId: WORKSPACE_ID,
          operationId: 'workspace-upgrade',
        },
        executionContext: {
          source: 'SYSTEM_BUILD',
          workspaceId: WORKSPACE_ID,
          operationId: 'workspace-upgrade',
        },
      }),
    ).not.toThrow();
  });

  it('allows an application manifest bound to its active context', () => {
    const applicationUniversalIdentifier =
      '44444444-4444-4444-8444-444444444444';

    expect(() =>
      assertDestructiveMetadataChangeIsAuthorized({
        actions: [{ type: 'delete', metadataName: 'fieldMetadata' }],
        workspaceId: WORKSPACE_ID,
        isSystemBuild: false,
        applicationUniversalIdentifier,
        authorization: {
          source: 'APPLICATION_MANIFEST',
          workspaceId: WORKSPACE_ID,
          applicationUniversalIdentifier,
        },
        executionContext: {
          source: 'APPLICATION_MANIFEST',
          workspaceId: WORKSPACE_ID,
          applicationUniversalIdentifier,
        },
      }),
    ).not.toThrow();
  });

  it('allows role and role-target deletion without metadata change-set authorization', () => {
    expect(() =>
      assertDestructiveMetadataChangeIsAuthorized({
        actions: [
          { type: 'delete', metadataName: 'role' },
          { type: 'delete', metadataName: 'roleTarget' },
        ],
        workspaceId: WORKSPACE_ID,
        isSystemBuild: false,
        authorization: undefined,
        executionContext: undefined,
      }),
    ).not.toThrow();
  });
});
