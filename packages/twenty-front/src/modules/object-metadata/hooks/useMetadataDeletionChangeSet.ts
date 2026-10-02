import { useMutation } from '@apollo/client/react';
import { isDefined } from 'twenty-shared/utils';

import {
  ACKNOWLEDGE_METADATA_CHANGE_SET_DEPENDENCIES,
  APPLY_METADATA_CHANGE_SET,
  APPROVE_METADATA_CHANGE_SET,
  PLAN_METADATA_CHANGE_SET,
  PREPARE_METADATA_DELETION_CHANGE_SET,
  VALIDATE_METADATA_CHANGE_SET,
} from '@/object-metadata/graphql/metadata-change-set.mutations';

export type MetadataDeletionTargetType = 'OBJECT' | 'FIELD' | 'INDEX';

export type MetadataDependencyImpact = Readonly<{
  workflows: readonly string[];
  views: readonly string[];
  applications: readonly string[];
  contracts: readonly string[];
  metadata: readonly string[];
}>;

export type PreparedMetadataDeletion = Readonly<{
  id: string;
  version: number;
  dependencyImpact: MetadataDependencyImpact;
  dependencyCount: number;
}>;

type PrepareMetadataDeletionData = {
  prepareMetadataDeletionChangeSet: {
    id: string;
    state: 'DRAFT';
    version: number;
  };
};

type PrepareMetadataDeletionVariables = {
  input: {
    targetType: MetadataDeletionTargetType;
    targetId: string;
  };
};

type PlanMetadataChangeSetData = {
  planMetadataChangeSet: {
    dependencyImpact: MetadataDependencyImpact;
    state: 'PLANNED';
    version: number;
  };
};

type VersionedMetadataChangeSetVariables = {
  id: string;
  expectedVersion: number;
};

type AcknowledgeMetadataChangeSetData = {
  acknowledgeMetadataChangeSetDependencies: {
    dependencyResolutionDigest: string;
    version: number;
  };
};

type ValidateMetadataChangeSetData = {
  validateMetadataChangeSet: {
    applyToken: string;
    compatibilityFindings: readonly string[];
    riskClass: 'R1' | 'R2' | 'R3';
    state: 'VALIDATED';
    version: number;
  };
};

type ApprovedMetadataChangeSetVariables =
  VersionedMetadataChangeSetVariables & {
    applyToken: string;
  };

type ApproveMetadataChangeSetData = {
  approveMetadataChangeSet: boolean;
};

export type ApplyMetadataChangeSetResult = Readonly<{
  status: 'SUCCEEDED' | 'RECONCILIATION_REQUIRED';
  value?: Readonly<{ appliedMetadataVersion: number }>;
}>;

type ApplyMetadataChangeSetData = {
  applyMetadataChangeSet: ApplyMetadataChangeSetResult;
};

export const useMetadataDeletionChangeSet = () => {
  const [prepareChangeSet] = useMutation<
    PrepareMetadataDeletionData,
    PrepareMetadataDeletionVariables
  >(PREPARE_METADATA_DELETION_CHANGE_SET);
  const [planChangeSet] = useMutation<
    PlanMetadataChangeSetData,
    VersionedMetadataChangeSetVariables
  >(PLAN_METADATA_CHANGE_SET);
  const [acknowledgeDependencies] = useMutation<
    AcknowledgeMetadataChangeSetData,
    VersionedMetadataChangeSetVariables
  >(ACKNOWLEDGE_METADATA_CHANGE_SET_DEPENDENCIES);
  const [validateChangeSet] = useMutation<
    ValidateMetadataChangeSetData,
    VersionedMetadataChangeSetVariables
  >(VALIDATE_METADATA_CHANGE_SET);
  const [approveChangeSet] = useMutation<
    ApproveMetadataChangeSetData,
    ApprovedMetadataChangeSetVariables
  >(APPROVE_METADATA_CHANGE_SET);
  const [applyChangeSet] = useMutation<
    ApplyMetadataChangeSetData,
    ApprovedMetadataChangeSetVariables
  >(APPLY_METADATA_CHANGE_SET);

  const prepareMetadataDeletion = async ({
    targetType,
    targetId,
  }: PrepareMetadataDeletionVariables['input']): Promise<PreparedMetadataDeletion> => {
    const preparedResponse = await prepareChangeSet({
      variables: { input: { targetType, targetId } },
    });
    const prepared = preparedResponse.data?.prepareMetadataDeletionChangeSet;

    if (!isDefined(prepared) || prepared.state !== 'DRAFT') {
      throw new Error('Metadata deletion draft was not created.');
    }

    const plannedResponse = await planChangeSet({
      variables: { id: prepared.id, expectedVersion: prepared.version },
    });
    const planned = plannedResponse.data?.planMetadataChangeSet;

    if (!isDefined(planned) || planned.state !== 'PLANNED') {
      throw new Error('Metadata deletion dependency plan is unavailable.');
    }

    return {
      id: prepared.id,
      version: planned.version,
      dependencyImpact: planned.dependencyImpact,
      dependencyCount: Object.values(planned.dependencyImpact).reduce(
        (count, dependencies) => count + dependencies.length,
        0,
      ),
    };
  };

  const applyPreparedMetadataDeletion = async (
    prepared: PreparedMetadataDeletion,
    {
      acknowledgeDependencies: shouldAcknowledgeDependencies,
    }: Readonly<{ acknowledgeDependencies: boolean }>,
  ): Promise<ApplyMetadataChangeSetResult> => {
    if (prepared.dependencyCount > 0 && !shouldAcknowledgeDependencies) {
      throw new Error(
        'Metadata deletion requires explicit dependency acknowledgement.',
      );
    }

    let currentVersion = prepared.version;

    if (prepared.dependencyCount > 0) {
      const acknowledgementResponse = await acknowledgeDependencies({
        variables: {
          id: prepared.id,
          expectedVersion: currentVersion,
        },
      });
      const acknowledgement =
        acknowledgementResponse.data?.acknowledgeMetadataChangeSetDependencies;

      if (!isDefined(acknowledgement)) {
        throw new Error('Metadata dependency acknowledgement was not saved.');
      }

      currentVersion = acknowledgement.version;
    }

    const validationResponse = await validateChangeSet({
      variables: { id: prepared.id, expectedVersion: currentVersion },
    });
    const validation = validationResponse.data?.validateMetadataChangeSet;

    if (!isDefined(validation) || validation.state !== 'VALIDATED') {
      throw new Error('Metadata deletion validation did not complete.');
    }

    const approvalResponse = await approveChangeSet({
      variables: {
        id: prepared.id,
        expectedVersion: validation.version,
        applyToken: validation.applyToken,
      },
    });

    if (approvalResponse.data?.approveMetadataChangeSet !== true) {
      throw new Error('Metadata deletion approval was not saved.');
    }

    const applyResponse = await applyChangeSet({
      variables: {
        id: prepared.id,
        expectedVersion: validation.version + 1,
        applyToken: validation.applyToken,
      },
    });
    const result = applyResponse.data?.applyMetadataChangeSet;

    if (!isDefined(result) || result.status !== 'SUCCEEDED') {
      throw new Error(
        'Metadata deletion requires reconciliation and was not completed.',
      );
    }

    return result;
  };

  return {
    applyPreparedMetadataDeletion,
    prepareMetadataDeletion,
  };
};
