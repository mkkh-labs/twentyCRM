import { useQuery } from '@apollo/client/react';
import { useLingui } from '@lingui/react/macro';
import { IconHistory } from 'twenty-ui/icon';
import { Card } from 'twenty-ui/surfaces';

import { SettingsOptionCardContentButton } from '@/settings/components/SettingsOptions/SettingsOptionCardContentButton';
import {
  GET_OUTBOX_OPERATIONS,
  type OutboxOperationsData,
  type OutboxOperationsVariables,
} from '@/settings/security/graphql/outboxOperations';

export const SettingsOutboxOperations = () => {
  const { t } = useLingui();
  const { data, loading } = useQuery<
    OutboxOperationsData,
    OutboxOperationsVariables
  >(GET_OUTBOX_OPERATIONS, {
    variables: { limit: 50 },
    fetchPolicy: 'network-only',
  });

  if (loading) {
    return null;
  }

  const operations = data?.outboxOperations ?? [];

  return (
    <>
      {operations.length === 0 ? (
        <Card rounded>
          <SettingsOptionCardContentButton
            Icon={IconHistory}
            title={t`No transactional events`}
            description={t`Domain events will appear here with delivery and reconciliation evidence.`}
            disabled
          />
        </Card>
      ) : null}
      {operations.map((operation) => (
        <Card rounded key={operation.id}>
          <SettingsOptionCardContentButton
            Icon={IconHistory}
            title={`${operation.state} · ${operation.eventType} v${operation.schemaVersion}`}
            description={`${operation.aggregateType}:${operation.aggregateId} · ${t`Attempts`} ${operation.attemptCount} · ${operation.recoverySafety}${operation.lastErrorCode === null ? '' : ` · ${t`Error`} ${operation.lastErrorCode}`} · ${t`Correlation`} ${operation.rootCorrelationId}`}
            disabled
          />
        </Card>
      ))}
    </>
  );
};
