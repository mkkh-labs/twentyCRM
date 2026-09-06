import { Injectable } from '@nestjs/common';

import { PolicyContextService } from 'src/engine/core-modules/policy/services/policy-context.service';
import { PolicyCorrelationService } from 'src/engine/core-modules/policy/services/policy-correlation.service';
import { PolicyDecisionService } from 'src/engine/core-modules/policy/services/policy-decision.service';
import { ProtectedOperationService } from 'src/engine/core-modules/policy/services/protected-operation.service';
import { buildDeterministicDigest } from 'src/engine/core-modules/policy/utils/build-deterministic-digest.util';

const EMAILING_SERVICE_AUTHORITY_BY_OPERATION = {
  'campaign.delivery-status.update': 'emailing-delivery-webhook',
  'campaign.statistics.refresh': 'emailing-campaign-statistics',
} as const;

type EmailingSystemOperation =
  keyof typeof EMAILING_SERVICE_AUTHORITY_BY_OPERATION;

type ExecuteEmailingSystemPolicyInput<TResult> = Readonly<{
  workspaceId: string;
  operation: EmailingSystemOperation;
  targetResourceId?: string;
  actionArguments: Readonly<Record<string, unknown>>;
  execute: () => Promise<TResult>;
}>;

@Injectable()
export class EmailingSystemPolicyService {
  constructor(
    private readonly policyContextService: PolicyContextService,
    private readonly policyCorrelationService: PolicyCorrelationService,
    private readonly policyDecisionService: PolicyDecisionService,
    private readonly protectedOperationService: ProtectedOperationService,
  ) {}

  async execute<TResult>({
    workspaceId,
    operation,
    targetResourceId,
    actionArguments,
    execute,
  }: ExecuteEmailingSystemPolicyInput<TResult>): Promise<TResult> {
    const serviceAuthorityId =
      EMAILING_SERVICE_AUTHORITY_BY_OPERATION[operation];
    const context = this.policyContextService.create({
      workspaceId,
      actor: {
        type: 'system',
        id: null,
        workspaceId,
        serviceAuthorityId,
      },
      authority: {
        type: 'serviceMutation',
        source: 'SCOPED_SERVICE_PRINCIPAL',
        workspaceId,
        authorityVersion: `${serviceAuthorityId}:1`,
        revocationState: 'ACTIVE',
        evaluatedAt: new Date().toISOString(),
        serviceAuthorityId,
        allowedOperations: [operation],
        maximumRiskClass: 'R1',
      },
      operation,
      riskClass: 'R1',
      target: {
        workspaceId,
        resourceType: 'messageCampaign',
        ...(targetResourceId === undefined
          ? {}
          : { resourceId: targetResourceId }),
      },
      affectedFieldMetadataIds: [],
      correlation: this.policyCorrelationService.createAttempt(),
    });
    const decision = this.policyDecisionService.create({
      context,
      outcome: 'ALLOW',
      reasonCodes: ['AUTHORIZED'],
    });
    const result = await this.protectedOperationService.execute({
      context,
      decision,
      auditMetadata: {
        argumentDigest: buildDeterministicDigest(actionArguments),
      },
      execute,
    });

    if (result.status === 'RECONCILIATION_REQUIRED') {
      throw new Error(
        'Emailing system operation requires reconciliation after execution.',
      );
    }

    if (result.status === 'DENIED') {
      throw new Error('Emailing system operation was denied before execution.');
    }

    return result.value;
  }
}
