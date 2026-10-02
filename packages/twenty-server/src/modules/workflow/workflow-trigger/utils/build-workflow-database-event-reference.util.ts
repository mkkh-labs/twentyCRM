import { randomUUID } from 'node:crypto';

import { type ObjectRecordEvent } from 'twenty-shared/database-events';

import { type DatabaseEventAction } from 'src/engine/api/graphql/graphql-query-runner/enums/database-event-action';
import { buildDeterministicDigest } from 'src/engine/core-modules/policy/utils/build-deterministic-digest.util';
import {
  type WorkflowDatabaseEventReference,
  type WorkflowTriggerProvenanceSignature,
} from 'src/modules/workflow/workflow-trigger/types/workflow-trigger-job-data.type';

const DATABASE_EVENT_REFERENCE_TTL_MILLISECONDS = 15 * 60 * 1_000;

export const buildWorkflowDatabaseEventReference = ({
  workspaceId,
  workflowId,
  workflowVersionId,
  triggerConfigurationDigest,
  objectMetadataId,
  objectNameSingular,
  action,
  event,
  now = new Date(),
  signReference,
}: Readonly<{
  workspaceId: string;
  workflowId: string;
  workflowVersionId: string;
  triggerConfigurationDigest: string;
  objectMetadataId: string;
  objectNameSingular: string;
  action: DatabaseEventAction;
  event: ObjectRecordEvent;
  now?: Date;
  signReference: (value: unknown) => WorkflowTriggerProvenanceSignature;
}>): WorkflowDatabaseEventReference => {
  const sourceEventDigest = buildDeterministicDigest(event);
  const idempotencyKey = buildDeterministicDigest({
    schemaVersion: 1,
    workspaceId,
    workflowId,
    workflowVersionId,
    triggerConfigurationDigest,
    objectMetadataId,
    objectNameSingular,
    action,
    sourceEventDigest,
  });
  const unsignedReference = {
    schemaVersion: 1 as const,
    provenance: 'WORKSPACE_DATABASE_EVENT' as const,
    policyVersion: 'p0-v1' as const,
    workspaceId,
    workflowId,
    workflowVersionId,
    triggerConfigurationDigest,
    objectMetadataId,
    objectNameSingular,
    action,
    recordId: event.recordId,
    updatedFields: [
      ...('updatedFields' in event.properties
        ? (event.properties.updatedFields ?? [])
        : []),
    ].sort(),
    sourceEventDigest,
    idempotencyKey,
    rootCorrelationId: randomUUID(),
    createdAt: now.toISOString(),
    expiresAt: new Date(
      now.getTime() + DATABASE_EVENT_REFERENCE_TTL_MILLISECONDS,
    ).toISOString(),
  };
  const provenanceSignature = signReference(unsignedReference);
  const referenceWithoutDigest = {
    ...unsignedReference,
    ...provenanceSignature,
  };

  return {
    ...referenceWithoutDigest,
    payloadDigest: buildDeterministicDigest(referenceWithoutDigest),
  };
};
