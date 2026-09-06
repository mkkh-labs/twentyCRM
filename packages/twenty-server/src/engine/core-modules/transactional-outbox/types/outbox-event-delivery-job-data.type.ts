export type OutboxEventDeliveryJobData = Readonly<{
  outboxEventId: string;
  workspaceId: string;
}>;
