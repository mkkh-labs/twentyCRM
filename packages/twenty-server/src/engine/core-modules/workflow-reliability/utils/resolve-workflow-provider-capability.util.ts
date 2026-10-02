import { type WorkflowProviderCapability } from 'src/engine/core-modules/workflow-reliability/types/workflow-provider-capability.type';

export const resolveWorkflowProviderCapability = ({
  providerClass,
  capabilities,
}: Readonly<{
  providerClass: string;
  capabilities: readonly WorkflowProviderCapability[];
}>): WorkflowProviderCapability => {
  const matches = capabilities.filter(
    (capability) => capability.providerClass === providerClass,
  );

  if (matches.length !== 1) {
    throw new Error(
      'External workflow provider requires one explicit capability contract.',
    );
  }

  const [capability] = matches;

  if (
    !Number.isSafeInteger(capability.maximumAutomaticAttempts) ||
    capability.maximumAutomaticAttempts < 1
  ) {
    throw new Error(
      'External workflow provider requires a positive safe-integer attempt limit.',
    );
  }

  if (
    !capability.supportsIdempotencyKey &&
    capability.maximumAutomaticAttempts !== 1
  ) {
    throw new Error(
      'Provider without idempotency support cannot be retried automatically.',
    );
  }

  return capability;
};
