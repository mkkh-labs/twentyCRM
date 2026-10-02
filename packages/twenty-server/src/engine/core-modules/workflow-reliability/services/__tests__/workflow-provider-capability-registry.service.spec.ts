import { WorkflowProviderCapabilityRegistryService } from 'src/engine/core-modules/workflow-reliability/services/workflow-provider-capability-registry.service';

describe('WorkflowProviderCapabilityRegistryService', () => {
  const service = new WorkflowProviderCapabilityRegistryService();

  it('keeps a registered provider single-attempt without unproven guarantees', () => {
    expect(service.resolve('HttpRequestWorkflowAction')).toEqual({
      providerClass: 'HttpRequestWorkflowAction',
      supportsIdempotencyKey: false,
      supportsOutcomeReconciliation: false,
      maximumAutomaticAttempts: 1,
    });
  });

  it('keeps campaign delivery single-attempt without unproven guarantees', () => {
    expect(service.resolve('MessageCampaignEmail')).toEqual({
      providerClass: 'MessageCampaignEmail',
      supportsIdempotencyKey: false,
      supportsOutcomeReconciliation: false,
      maximumAutomaticAttempts: 1,
    });
  });

  it('rejects a provider without an explicit capability contract', () => {
    expect(() => service.resolve('unregistered-provider')).toThrow(
      'requires one explicit capability contract',
    );
  });

  it('prevents runtime mutation of a registered provider contract', () => {
    const capability = service.resolve('HttpRequestWorkflowAction');

    expect(Reflect.set(capability, 'maximumAutomaticAttempts', 2)).toBe(false);
    expect(service.resolve('HttpRequestWorkflowAction')).toMatchObject({
      maximumAutomaticAttempts: 1,
      supportsIdempotencyKey: false,
      supportsOutcomeReconciliation: false,
    });
  });
});
