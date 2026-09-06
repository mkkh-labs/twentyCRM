export type WorkspacePortableExportManifest = {
  schemaVersion: 1;
  exportId: string;
  rootCorrelationId: string;
  platformVersion: string;
  workspaceId: string;
  workspaceSchemaName: string;
  createdAt: string;
  configurationVersion: {
    id: string;
    snapshotDigest: string;
  } | null;
  scope: { type: 'FULL'; tables: [] } | { type: 'FILTERED'; tables: string[] };
  artifact: {
    fileName: string;
    cipher: 'AES-256-GCM';
    keyDerivation: 'SCRYPT';
    salt: string;
    initializationVector: string;
    authenticationTag: string;
    sha256: string;
    containsSensitiveData: true;
  };
};
