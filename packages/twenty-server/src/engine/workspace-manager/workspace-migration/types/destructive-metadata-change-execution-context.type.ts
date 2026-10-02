export type DestructiveMetadataChangeExecutionContext =
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
