import { useLingui } from '@lingui/react/macro';
import { useMutation, useQuery } from '@apollo/client/react';

import { SettingsOptionCardContentButton } from '@/settings/components/SettingsOptions/SettingsOptionCardContentButton';
import { useIsFeatureEnabled } from '@/workspace/hooks/useIsFeatureEnabled';
import {
  APPROVE_AGENT_ACTION_REQUEST,
  type ApproveAgentActionRequestVariables,
  DENY_AGENT_ACTION_REQUEST,
  type DenyAgentActionRequestVariables,
  GET_PENDING_AGENT_ACTION_APPROVAL_REQUESTS,
  type PendingAgentActionApprovalRequestsData,
} from '@/settings/security/graphql/agentActionApprovals';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { FeatureFlagKey } from 'twenty-shared/types';
import { IconLego, IconLock } from 'twenty-ui/icon';
import { Button, ButtonGroup } from 'twenty-ui/input';
import { Card } from 'twenty-ui/surfaces';

const APPROVAL_DURATION_MILLISECONDS = 5 * 60 * 1000;

export const SettingsAgentActionApprovals = () => {
  const { t } = useLingui();
  const { enqueueErrorSnackBar, enqueueSuccessSnackBar } = useSnackBar();
  const areWorkspaceAgentWritesEnabled = useIsFeatureEnabled(
    FeatureFlagKey.IS_AGENT_WRITES_ENABLED,
  );
  const { data, loading, refetch } =
    useQuery<PendingAgentActionApprovalRequestsData>(
      GET_PENDING_AGENT_ACTION_APPROVAL_REQUESTS,
      { fetchPolicy: 'network-only' },
    );
  const [approveRequest, { loading: isApproving }] = useMutation<
    unknown,
    ApproveAgentActionRequestVariables
  >(APPROVE_AGENT_ACTION_REQUEST);
  const [denyRequest, { loading: isDenying }] = useMutation<
    unknown,
    DenyAgentActionRequestVariables
  >(DENY_AGENT_ACTION_REQUEST);
  const requests = data?.pendingAgentActionApprovalRequests ?? [];

  const handleApprove = async (requestId: string) => {
    try {
      await approveRequest({
        variables: {
          input: {
            requestId,
            expiresAt: new Date(
              Date.now() + APPROVAL_DURATION_MILLISECONDS,
            ).toISOString(),
          },
        },
      });
      await refetch();
      enqueueSuccessSnackBar({
        message: t`Agent action approved for 5 minutes`,
      });
    } catch (error) {
      enqueueErrorSnackBar({
        apolloError: CombinedGraphQLErrors.is(error) ? error : undefined,
      });
    }
  };

  const handleDeny = async (requestId: string) => {
    try {
      await denyRequest({ variables: { requestId } });
      await refetch();
      enqueueSuccessSnackBar({ message: t`Agent action denied` });
    } catch (error) {
      enqueueErrorSnackBar({
        apolloError: CombinedGraphQLErrors.is(error) ? error : undefined,
      });
    }
  };

  if (loading) {
    return null;
  }

  return (
    <>
      <Card rounded>
        <SettingsOptionCardContentButton
          Icon={IconLock}
          title={
            areWorkspaceAgentWritesEnabled
              ? t`Workspace agent writes enabled`
              : t`Workspace agent writes blocked`
          }
          description={
            areWorkspaceAgentWritesEnabled
              ? t`Writes still require role authorization, policy evaluation, and approval when applicable.`
              : t`The workspace kill switch denies every agent write before execution.`
          }
          disabled
        />
      </Card>
      {requests.length === 0 ? (
        <Card rounded>
          <SettingsOptionCardContentButton
            Icon={IconLego}
            title={t`No pending agent actions`}
            description={t`Material and destructive agent actions remain denied until explicitly approved.`}
            disabled
          />
        </Card>
      ) : null}
      {requests.map((request) => (
        <Card rounded key={request.id}>
          <SettingsOptionCardContentButton
            Icon={IconLego}
            title={`${request.riskClass} · ${request.action}`}
            description={`${t`Actor`} ${request.actorId} · ${request.target} · ${t`Expires`} ${request.expiresAt} · ${t`Digest`} ${request.actionDigest}`}
            Button={
              <ButtonGroup>
                <Button
                  title={t`Deny`}
                  variant="secondary"
                  size="small"
                  disabled={isApproving || isDenying}
                  onClick={() => handleDeny(request.id)}
                />
                <Button
                  title={t`Approve for 5 minutes`}
                  variant="primary"
                  accent="blue"
                  size="small"
                  disabled={isApproving || isDenying}
                  onClick={() => handleApprove(request.id)}
                />
              </ButtonGroup>
            }
          />
        </Card>
      ))}
    </>
  );
};
