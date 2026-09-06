export type OutboxEventDeliveryEnvelope = Readonly<{
  eventId: string;
  workspaceId: string;
  eventType: string;
  schemaVersion: number;
  aggregateType: string;
  aggregateId: string;
  payload: Readonly<Record<string, unknown>>;
  payloadDigest: string;
  rootCorrelationId: string;
}>;
