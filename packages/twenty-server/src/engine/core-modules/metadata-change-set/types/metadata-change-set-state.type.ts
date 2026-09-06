export type MetadataChangeSetState =
  | 'DRAFT'
  | 'PLANNED'
  | 'VALIDATED'
  | 'APPROVED'
  | 'APPLYING'
  | 'APPLIED'
  | 'FAILED'
  | 'ROLLBACK_PENDING'
  | 'ROLLED_BACK'
  | 'FORWARD_FIXED';
