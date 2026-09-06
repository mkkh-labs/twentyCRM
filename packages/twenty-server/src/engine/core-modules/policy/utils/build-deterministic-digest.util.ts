import { createHash } from 'node:crypto';

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value
      .map(canonicalize)
      .sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right)),
      );
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, entryValue]) => [key, canonicalize(entryValue)]),
    );
  }

  return value;
};

export const buildDeterministicDigest = (value: unknown): string =>
  createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
