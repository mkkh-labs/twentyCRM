import { PolicyContextService } from 'src/engine/core-modules/policy/services/policy-context.service';
import { PolicyCorrelationService } from 'src/engine/core-modules/policy/services/policy-correlation.service';
import { PolicyDecisionService } from 'src/engine/core-modules/policy/services/policy-decision.service';
import { EmailingSystemPolicyService } from 'src/modules/emailing/services/emailing-system-policy.service';

const WORKSPACE_ID = '20202020-aaaa-4d02-bf25-6aeccf7ea419';
const CAMPAIGN_ID = '20202020-ffff-4d02-bf25-6aeccf7ea419';

describe('EmailingSystemPolicyService', () => {
  it('binds a delivery webhook mutation to one R1 service authority', async () => {
    const protectedOperationService = {
      execute: jest.fn().mockImplementation(async ({ execute, decision }) => ({
        status: 'SUCCEEDED',
        value: await execute(),
        policyDecisionId: decision.id,
      })),
    };
    const service = new EmailingSystemPolicyService(
      new PolicyContextService(),
      new PolicyCorrelationService(),
      new PolicyDecisionService(),
      protectedOperationService as never,
    );
    const effect = jest.fn().mockResolvedValue(undefined);

    await expect(
      service.execute({
        workspaceId: WORKSPACE_ID,
        operation: 'campaign.delivery-status.update',
        targetResourceId: CAMPAIGN_ID,
        actionArguments: {
          providerMessageIdDigest:
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
        execute: effect,
      }),
    ).resolves.toBeUndefined();

    expect(effect).toHaveBeenCalledTimes(1);
    expect(protectedOperationService.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          operation: 'campaign.delivery-status.update',
          riskClass: 'R1',
          actor: {
            type: 'system',
            id: null,
            workspaceId: WORKSPACE_ID,
            serviceAuthorityId: 'emailing-delivery-webhook',
          },
          authority: expect.objectContaining({
            type: 'serviceMutation',
            serviceAuthorityId: 'emailing-delivery-webhook',
            allowedOperations: ['campaign.delivery-status.update'],
            maximumRiskClass: 'R1',
          }),
        }),
        auditMetadata: {
          argumentDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
      }),
    );
  });

  it('denies without invoking the mutation when durable audit is unavailable', async () => {
    const protectedOperationService = {
      execute: jest.fn().mockResolvedValue({
        status: 'DENIED',
        policyDecisionId: '20202020-1111-4d02-bf25-6aeccf7ea419',
        reasonCodes: ['AUDIT_UNAVAILABLE'],
      }),
    };
    const service = new EmailingSystemPolicyService(
      new PolicyContextService(),
      new PolicyCorrelationService(),
      new PolicyDecisionService(),
      protectedOperationService as never,
    );
    const effect = jest.fn();

    await expect(
      service.execute({
        workspaceId: WORKSPACE_ID,
        operation: 'campaign.statistics.refresh',
        targetResourceId: CAMPAIGN_ID,
        actionArguments: { campaignId: CAMPAIGN_ID },
        execute: effect,
      }),
    ).rejects.toThrow('Emailing system operation was denied before execution.');
    expect(effect).not.toHaveBeenCalled();
  });
});
