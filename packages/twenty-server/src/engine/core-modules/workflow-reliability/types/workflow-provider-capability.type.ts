export type WorkflowProviderCapability = Readonly<{
  providerClass: string;
  supportsIdempotencyKey: boolean;
  supportsOutcomeReconciliation: boolean;
  maximumAutomaticAttempts: number;
}>;
