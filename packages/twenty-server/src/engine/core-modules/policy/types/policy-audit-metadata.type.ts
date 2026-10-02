export type PolicyAuditMetadata = Readonly<{
  targetCount?: number;
  argumentDigest?: string;
  idempotencyKeyDigest?: string;
  providerClass?: string;
  providerReferenceDigest?: string;
  correlationSource?: 'SERVER_GENERATED' | 'LEGACY_WORKFLOW_RUN_ID';
  workflowVersionId?: string;
  replayOfAttemptId?: string;
  payloadSchemaVersion?: number;
  payloadDigest?: string;
  payloadClassification?: 'CONTROL' | 'BUSINESS_RESTRICTED';
  approvalId?: string;
}>;
