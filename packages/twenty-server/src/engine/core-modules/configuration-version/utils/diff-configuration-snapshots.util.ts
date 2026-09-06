import { type AllMetadataName } from 'twenty-shared/metadata';

export type ConfigurationSnapshotEntry = Readonly<{
  metadataName: AllMetadataName;
  universalIdentifier: string;
  contentDigest: string;
}>;

export type ConfigurationSnapshot = Readonly<{
  schemaVersion: 1;
  entries: Readonly<Record<string, ConfigurationSnapshotEntry>>;
}>;

export type ConfigurationCompatibility =
  | 'BACKWARD_COMPATIBLE'
  | 'REVIEW_REQUIRED'
  | 'BREAKING';

export const diffConfigurationSnapshots = (
  previous: ConfigurationSnapshot,
  next: ConfigurationSnapshot,
) => {
  if (previous.schemaVersion !== 1 || next.schemaVersion !== 1) {
    throw new Error('Configuration snapshot schema version is unsupported.');
  }

  const previousIdentifiers = new Set(Object.keys(previous.entries));
  const nextIdentifiers = new Set(Object.keys(next.entries));
  const added = [...nextIdentifiers]
    .filter((identifier) => !previousIdentifiers.has(identifier))
    .sort();
  const removed = [...previousIdentifiers]
    .filter((identifier) => !nextIdentifiers.has(identifier))
    .sort();
  const changed = [...previousIdentifiers]
    .filter(
      (identifier) =>
        nextIdentifiers.has(identifier) &&
        previous.entries[identifier].contentDigest !==
          next.entries[identifier].contentDigest,
    )
    .sort();

  return {
    added,
    changed,
    removed,
    compatibility: (removed.length > 0
      ? 'BREAKING'
      : changed.length > 0
        ? 'REVIEW_REQUIRED'
        : 'BACKWARD_COMPATIBLE') as ConfigurationCompatibility,
  };
};
