import { useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';

import { SettingsOptionCardContentButton } from '@/settings/components/SettingsOptions/SettingsOptionCardContentButton';
import {
  GET_POLICY_AUDIT_EVENTS,
  type PolicyAuditEventsData,
  type PolicyAuditEventsVariables,
} from '@/settings/security/graphql/policyAuditEvents';
import { useLingui } from '@lingui/react/macro';
import { IconHistory } from 'twenty-ui/icon';
import { SearchInput } from 'twenty-ui/input';
import { Card } from 'twenty-ui/surfaces';

export const SettingsPolicyAuditExplorer = () => {
  const { t } = useLingui();
  const [searchTerm, setSearchTerm] = useState('');
  const { data, loading } = useQuery<
    PolicyAuditEventsData,
    PolicyAuditEventsVariables
  >(GET_POLICY_AUDIT_EVENTS, {
    variables: { limit: 100 },
    fetchPolicy: 'network-only',
  });
  const events = useMemo(
    () => data?.policyAuditEvents ?? [],
    [data?.policyAuditEvents],
  );
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const filteredEvents = useMemo(
    () =>
      events.filter((event) =>
        [
          event.operation,
          event.actorId,
          event.resourceType,
          event.resourceId,
          event.rootCorrelationId,
          event.policyDecisionId,
          ...event.reasonCodes,
        ].some((value) =>
          (value ?? '').toLowerCase().includes(normalizedSearchTerm),
        ),
      ),
    [events, normalizedSearchTerm],
  );

  if (loading) {
    return null;
  }

  return (
    <>
      <SearchInput
        placeholder={t`Search actor, action, resource, or correlation ID...`}
        value={searchTerm}
        onChange={setSearchTerm}
      />
      {filteredEvents.length === 0 ? (
        <Card rounded>
          <SettingsOptionCardContentButton
            Icon={IconHistory}
            title={t`No matching policy audit events`}
            description={t`The explorer returns only workspace-scoped, allowlisted audit evidence.`}
            disabled
          />
        </Card>
      ) : null}
      {filteredEvents.map((event) => (
        <Card rounded key={event.id}>
          <SettingsOptionCardContentButton
            Icon={IconHistory}
            title={`${event.riskClass} · ${event.policyOutcome} · ${event.operation}`}
            description={`${event.phase} · ${event.result} · ${t`Actor`} ${event.actorType}:${event.actorId ?? event.authoritySource} · ${t`Target`} ${event.resourceType}:${event.resourceId ?? 'workspace'} · ${t`Correlation`} ${event.rootCorrelationId} · ${t`Decision`} ${event.policyDecisionId}`}
            disabled
          />
        </Card>
      ))}
    </>
  );
};
