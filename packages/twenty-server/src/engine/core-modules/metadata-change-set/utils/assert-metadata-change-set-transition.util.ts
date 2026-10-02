import { type MetadataChangeSetState } from 'src/engine/core-modules/metadata-change-set/types/metadata-change-set-state.type';

const TRANSITIONS: Record<
  MetadataChangeSetState,
  readonly MetadataChangeSetState[]
> = {
  DRAFT: ['PLANNED'],
  PLANNED: ['VALIDATED', 'FAILED'],
  VALIDATED: ['APPROVED', 'FAILED'],
  APPROVED: ['APPLYING'],
  APPLYING: ['APPLIED', 'FAILED'],
  APPLIED: ['ROLLBACK_PENDING'],
  FAILED: ['ROLLBACK_PENDING', 'FORWARD_FIXED'],
  ROLLBACK_PENDING: ['ROLLED_BACK', 'FORWARD_FIXED'],
  ROLLED_BACK: [],
  FORWARD_FIXED: [],
};

export const assertMetadataChangeSetTransition = (
  from: MetadataChangeSetState,
  to: MetadataChangeSetState,
): void => {
  if (!TRANSITIONS[from].includes(to)) {
    throw new Error(`Invalid metadata change-set transition ${from} -> ${to}.`);
  }
};
