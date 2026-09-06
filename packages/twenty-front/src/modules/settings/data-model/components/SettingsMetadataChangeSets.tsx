import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';

import { SettingsOptionCardContentButton } from '@/settings/components/SettingsOptions/SettingsOptionCardContentButton';
import {
  APPROVE_METADATA_CHANGE_SET_ROLLBACK,
  type ApproveMetadataChangeSetRollbackData,
  type ApproveMetadataChangeSetRollbackVariables,
  GET_METADATA_CHANGE_SETS,
  type MetadataChangeSetListItem,
  type MetadataChangeSetsData,
  type MetadataChangeSetsVariables,
  ROLLBACK_METADATA_CHANGE_SET,
  type RollbackMetadataChangeSetData,
  type RollbackMetadataChangeSetVariables,
} from '@/settings/data-model/graphql/metadataChangeSets';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { ConfirmationModal } from '@/ui/layout/modal/components/ConfirmationModal';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { useLingui } from '@lingui/react/macro';
import { IconHistory } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/input';
import { Card } from 'twenty-ui/surfaces';

const METADATA_CHANGE_SET_ROLLBACK_MODAL_ID =
  'metadata-change-set-rollback-confirmation-modal';

const getDependencyCount = (changeSet: MetadataChangeSetListItem): number =>
  Object.values(changeSet.dependencyImpact).reduce(
    (count, dependencies) => count + dependencies.length,
    0,
  );

export const SettingsMetadataChangeSets = () => {
  const { t } = useLingui();
  const { openModal } = useModal();
  const { enqueueErrorSnackBar, enqueueSuccessSnackBar } = useSnackBar();
  const [selectedChangeSet, setSelectedChangeSet] =
    useState<MetadataChangeSetListItem | null>(null);
  const { data, loading, refetch } = useQuery<
    MetadataChangeSetsData,
    MetadataChangeSetsVariables
  >(GET_METADATA_CHANGE_SETS, {
    variables: { limit: 20 },
    fetchPolicy: 'network-only',
  });
  const [rollbackChangeSet, { loading: isRollingBack }] = useMutation<
    RollbackMetadataChangeSetData,
    RollbackMetadataChangeSetVariables
  >(ROLLBACK_METADATA_CHANGE_SET);
  const [approveRollback, { loading: isApprovingRollback }] = useMutation<
    ApproveMetadataChangeSetRollbackData,
    ApproveMetadataChangeSetRollbackVariables
  >(APPROVE_METADATA_CHANGE_SET_ROLLBACK);

  if (loading) {
    return null;
  }

  const changeSets = data?.metadataChangeSets ?? [];

  const requestRollback = (changeSet: MetadataChangeSetListItem) => {
    setSelectedChangeSet(changeSet);
    openModal(METADATA_CHANGE_SET_ROLLBACK_MODAL_ID);
  };

  const confirmRollback = async () => {
    if (
      selectedChangeSet === null ||
      (selectedChangeSet.state !== 'APPLIED' &&
        selectedChangeSet.state !== 'FAILED')
    ) {
      return;
    }

    try {
      const approvalResult = await approveRollback({
        variables: {
          id: selectedChangeSet.id,
          expectedVersion: selectedChangeSet.version,
          from: selectedChangeSet.state,
        },
      });
      const approval = approvalResult.data?.approveMetadataChangeSetRollback;

      if (approval === undefined) {
        throw new Error('Metadata rollback approval was not saved.');
      }

      const result = await rollbackChangeSet({
        variables: {
          id: selectedChangeSet.id,
          expectedVersion: approval.version,
          from: selectedChangeSet.state,
          rollbackToken: approval.rollbackToken,
          approvalId: approval.approvalId,
        },
      });

      if (result.data?.rollbackMetadataChangeSet.status !== 'SUCCEEDED') {
        throw new Error('Metadata rollback requires reconciliation.');
      }

      await refetch();
      enqueueSuccessSnackBar({ message: t`Metadata rollback completed` });
    } catch (error) {
      enqueueErrorSnackBar({
        apolloError: CombinedGraphQLErrors.is(error) ? error : undefined,
      });
    } finally {
      setSelectedChangeSet(null);
    }
  };

  return (
    <>
      {changeSets.length === 0 ? (
        <Card rounded>
          <SettingsOptionCardContentButton
            Icon={IconHistory}
            title={t`No metadata change sets`}
            description={t`Destructive metadata changes will appear here with dependency and recovery evidence.`}
            disabled
          />
        </Card>
      ) : null}
      {changeSets.map((changeSet) => {
        const operation = changeSet.operations[0];
        const canRollback =
          changeSet.recoveryStrategy === 'ROLLBACK' &&
          (changeSet.state === 'APPLIED' || changeSet.state === 'FAILED');

        return (
          <Card rounded key={changeSet.id}>
            <SettingsOptionCardContentButton
              Icon={IconHistory}
              title={`${changeSet.riskClass ?? 'UNVALIDATED'} · ${changeSet.state} · ${operation?.operation ?? 'UNKNOWN'} ${operation?.metadataType ?? ''}`}
              description={`${t`Dependencies`} ${getDependencyCount(changeSet)} · ${t`Base version`} ${changeSet.baseMetadataVersion} · ${t`Current version`} ${changeSet.appliedMetadataVersion ?? 'not applied'} · ${t`Recovery`} ${changeSet.recoveryStrategy ?? 'not selected'}${changeSet.failureCode === null ? '' : ` · ${t`Failure`} ${changeSet.failureCode}`}`}
              Button={
                canRollback ? (
                  <Button
                    title={t`Review rollback`}
                    variant="secondary"
                    accent="danger"
                    size="small"
                    onClick={() => requestRollback(changeSet)}
                  />
                ) : undefined
              }
            />
          </Card>
        );
      })}
      <ConfirmationModal
        modalInstanceId={METADATA_CHANGE_SET_ROLLBACK_MODAL_ID}
        title={t`Rollback this metadata change?`}
        subtitle={t`This executes the recorded recovery plan as a new audited metadata version. Type "yes" to confirm.`}
        confirmButtonText={t`Rollback`}
        confirmationValue="yes"
        confirmationPlaceholder="yes"
        onConfirmClick={confirmRollback}
        onClose={() => setSelectedChangeSet(null)}
        loading={isApprovingRollback || isRollingBack}
      />
    </>
  );
};
