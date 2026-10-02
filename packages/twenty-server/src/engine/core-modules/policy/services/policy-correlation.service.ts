import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { isValidUuid } from 'twenty-shared/utils';

import { type PolicyCorrelationContext } from 'src/engine/core-modules/policy/types/policy-context.type';

export type CreatePolicyAttemptInput = Readonly<{
  rootCorrelationId?: string;
  traceId?: string;
  jobId?: string;
  workflowRunId?: string;
  mutationOrEffectId?: string;
}>;

@Injectable()
export class PolicyCorrelationService {
  createRoot(): string {
    return randomUUID();
  }

  createAttempt({
    rootCorrelationId = this.createRoot(),
    ...transportIdentifiers
  }: CreatePolicyAttemptInput = {}): PolicyCorrelationContext {
    if (!isValidUuid(rootCorrelationId)) {
      throw new Error('Root correlation identifier must be a UUID.');
    }

    return Object.freeze({
      rootCorrelationId,
      decisionId: randomUUID(),
      attemptId: randomUUID(),
      ...transportIdentifiers,
    });
  }
}
