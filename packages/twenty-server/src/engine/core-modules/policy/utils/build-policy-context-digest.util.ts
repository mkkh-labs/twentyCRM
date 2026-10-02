import { type PolicyContext } from 'src/engine/core-modules/policy/types/policy-context.type';
import { buildDeterministicDigest } from 'src/engine/core-modules/policy/utils/build-deterministic-digest.util';

export const buildPolicyContextDigest = (context: PolicyContext): string =>
  buildDeterministicDigest(context);
