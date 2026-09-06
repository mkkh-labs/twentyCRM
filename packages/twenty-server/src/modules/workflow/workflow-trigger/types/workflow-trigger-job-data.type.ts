import { type DatabaseEventAction } from 'src/engine/api/graphql/graphql-query-runner/enums/database-event-action';

export type WorkflowDatabaseEventReference = Readonly<{
  schemaVersion: 1;
  provenance: 'WORKSPACE_DATABASE_EVENT';
  policyVersion: 'p0-v1';
  workspaceId: string;
  workflowId: string;
  objectMetadataId: string;
  objectNameSingular: string;
  action: DatabaseEventAction;
  recordId: string;
  updatedFields: readonly string[];
  sourceEventDigest: string;
  idempotencyKey: string;
  rootCorrelationId: string;
  createdAt: string;
  expiresAt: string;
  payloadDigest: string;
}>;

export type WorkflowTriggerJobData =
  | Readonly<{
      triggerType: 'database-event';
      workspaceId: string;
      workflowId: string;
      databaseEvent: WorkflowDatabaseEventReference;
    }>
  | Readonly<{
      triggerType: 'cron';
      workspaceId: string;
      workflowId: string;
      payload: Record<string, never>;
      rootCorrelationId: string;
    }>;
