import { Injectable } from '@nestjs/common';

import {
  PolicyException,
  PolicyExceptionCode,
} from 'src/engine/core-modules/policy/policy.exception';
import {
  type PolicyActor,
  type PolicyAuthority,
  type PolicyContext,
  type PolicyCorrelationContext,
  type PolicyRiskClass,
  type PolicyTarget,
} from 'src/engine/core-modules/policy/types/policy-context.type';
import { validatePolicyContext } from 'src/engine/core-modules/policy/utils/validate-policy-context.util';

export type CreatePolicyContextInput = Readonly<{
  workspaceId: string;
  actor: PolicyActor;
  authority: PolicyAuthority;
  operation: string;
  riskClass: PolicyRiskClass;
  target: PolicyTarget;
  affectedFieldMetadataIds: readonly string[];
  correlation: PolicyCorrelationContext;
}>;

@Injectable()
export class PolicyContextService {
  create(input: CreatePolicyContextInput): PolicyContext {
    const candidate = {
      schemaVersion: 1 as const,
      policyVersion: 'p0-v1' as const,
      ...input,
    };
    const validation = validatePolicyContext(candidate);

    if (!validation.valid) {
      throw new PolicyException(
        'Policy context was rejected before protected execution.',
        validation.reason === 'BYPASS_AUTHORITY_FORBIDDEN'
          ? PolicyExceptionCode.BYPASS_FORBIDDEN
          : PolicyExceptionCode.CONTEXT_INVALID,
      );
    }

    return Object.freeze(validation.context);
  }
}
