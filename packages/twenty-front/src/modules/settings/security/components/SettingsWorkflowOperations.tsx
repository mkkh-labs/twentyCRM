import { useQuery } from '@apollo/client/react';

import { SettingsOptionCardContentButton } from '@/settings/components/SettingsOptions/SettingsOptionCardContentButton';
import {
  GET_WORKFLOW_OPERATIONS,
  type WorkflowOperationsData,
  type WorkflowOperationsVariables,
} from '@/settings/security/graphql/workflowOperations';
import { useLingui } from '@lingui/react/macro';
import { IconSettingsAutomation } from 'twenty-ui/icon';
import { Card } from 'twenty-ui/surfaces';

export const SettingsWorkflowOperations = () => {
  const { t } = useLingui();
  const { data, loading } = useQuery<
    WorkflowOperationsData,
    WorkflowOperationsVariables
  >(GET_WORKFLOW_OPERATIONS, {
    variables: { limit: 50 },
    fetchPolicy: 'network-only',
  });

  if (loading) {
    return null;
  }

  const operations = data?.workflowOperations ?? [];

  return (
    <>
      {operations.length === 0 ? (
        <Card rounded>
          <SettingsOptionCardContentButton
            Icon={IconSettingsAutomation}
            title={t`No protected workflow operations`}
            description={t`Protected workflow effects will appear here with retry and replay-safety evidence.`}
            disabled
          />
        </Card>
      ) : null}
      {operations.map((operation) => (
        <Card rounded key={operation.id}>
          <SettingsOptionCardContentButton
            Icon={IconSettingsAutomation}
            title={`${operation.state} · ${operation.providerClass} · ${operation.stepId}`}
            description={`${t`Run`} ${operation.workflowRunId} · ${t`Attempts`} ${operation.attemptCount} · ${t`Replay`} ${operation.replaySafety}${operation.lastErrorCode === null ? '' : ` · ${t`Error`} ${operation.lastErrorCode}`}`}
            disabled
          />
        </Card>
      ))}
    </>
  );
};
