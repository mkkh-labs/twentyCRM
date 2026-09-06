import { gql } from '@apollo/client';
import { isDefined } from 'twenty-shared/utils';

import { makeMetadataAPIRequest } from 'test/integration/metadata/suites/utils/make-metadata-api-request.util';
import { warnIfErrorButNotExpectedToFail } from 'test/integration/metadata/utils/warn-if-error-but-not-expected-to-fail.util';

const PREPARE_METADATA_DELETION_CHANGE_SET = gql`
  mutation PrepareMetadataDeletionChangeSet(
    $input: PrepareMetadataDeletionChangeSetInput!
  ) {
    prepareMetadataDeletionChangeSet(input: $input)
  }
`;

const PLAN_METADATA_DELETION_CHANGE_SET = gql`
  mutation PlanMetadataDeletionChangeSet($id: String!, $expectedVersion: Int!) {
    planMetadataChangeSet(id: $id, expectedVersion: $expectedVersion)
  }
`;

const ACKNOWLEDGE_METADATA_DELETION_DEPENDENCIES = gql`
  mutation AcknowledgeMetadataDeletionDependencies(
    $id: String!
    $expectedVersion: Int!
  ) {
    acknowledgeMetadataChangeSetDependencies(
      id: $id
      expectedVersion: $expectedVersion
    )
  }
`;

const VALIDATE_METADATA_DELETION_CHANGE_SET = gql`
  mutation ValidateMetadataDeletionChangeSet(
    $id: String!
    $expectedVersion: Int!
  ) {
    validateMetadataChangeSet(id: $id, expectedVersion: $expectedVersion)
  }
`;

const APPROVE_METADATA_DELETION_CHANGE_SET = gql`
  mutation ApproveMetadataDeletionChangeSet(
    $id: String!
    $expectedVersion: Int!
    $applyToken: String!
  ) {
    approveMetadataChangeSet(
      id: $id
      expectedVersion: $expectedVersion
      applyToken: $applyToken
    )
  }
`;

const APPLY_METADATA_DELETION_CHANGE_SET = gql`
  mutation ApplyMetadataDeletionChangeSet(
    $id: String!
    $expectedVersion: Int!
    $applyToken: String!
  ) {
    applyMetadataChangeSet(
      id: $id
      expectedVersion: $expectedVersion
      applyToken: $applyToken
    )
  }
`;

type MetadataDeletionTargetType = 'FIELD' | 'INDEX' | 'OBJECT';

type MetadataDeletionDependencyImpact = Record<string, readonly string[]>;

type MetadataDeletionChangeSetResponse = Readonly<{
  prepareMetadataDeletionChangeSet?: Readonly<{
    id: string;
    state: string;
    version: number;
  }>;
  planMetadataChangeSet?: Readonly<{
    dependencyImpact: MetadataDeletionDependencyImpact;
    state: string;
    version: number;
  }>;
  acknowledgeMetadataChangeSetDependencies?: Readonly<{
    version: number;
  }>;
  validateMetadataChangeSet?: Readonly<{
    applyToken: string;
    state: string;
    version: number;
  }>;
  approveMetadataChangeSet?: boolean;
  applyMetadataChangeSet?: Readonly<{ status: string }>;
}>;

export const applyMetadataDeletionChangeSet = async ({
  targetId,
  targetType,
  token,
}: Readonly<{
  targetId: string;
  targetType: MetadataDeletionTargetType;
  token?: string;
}>): Promise<void> => {
  const prepareResponse = await makeMetadataAPIRequest(
    {
      query: PREPARE_METADATA_DELETION_CHANGE_SET,
      variables: { input: { targetId, targetType } },
    },
    token,
  );

  warnIfErrorButNotExpectedToFail({
    response: prepareResponse,
    errorMessage: `${targetType} metadata deletion change set preparation failed`,
  });

  const prepared = (
    prepareResponse.body.data as MetadataDeletionChangeSetResponse | undefined
  )?.prepareMetadataDeletionChangeSet;

  if (!isDefined(prepared) || prepared.state !== 'DRAFT') {
    throw new Error(
      `${targetType} metadata deletion change set was not prepared.`,
    );
  }

  const planResponse = await makeMetadataAPIRequest(
    {
      query: PLAN_METADATA_DELETION_CHANGE_SET,
      variables: { id: prepared.id, expectedVersion: prepared.version },
    },
    token,
  );

  warnIfErrorButNotExpectedToFail({
    response: planResponse,
    errorMessage: `${targetType} metadata deletion change set planning failed`,
  });

  const planned = (
    planResponse.body.data as MetadataDeletionChangeSetResponse | undefined
  )?.planMetadataChangeSet;

  if (!isDefined(planned) || planned.state !== 'PLANNED') {
    throw new Error(
      `${targetType} metadata deletion change set was not planned.`,
    );
  }

  const dependencyCount = Object.values(planned.dependencyImpact).reduce(
    (count, dependencies) => count + dependencies.length,
    0,
  );
  let expectedVersion = planned.version;

  if (dependencyCount > 0) {
    const acknowledgeResponse = await makeMetadataAPIRequest(
      {
        query: ACKNOWLEDGE_METADATA_DELETION_DEPENDENCIES,
        variables: { id: prepared.id, expectedVersion },
      },
      token,
    );

    warnIfErrorButNotExpectedToFail({
      response: acknowledgeResponse,
      errorMessage: `${targetType} metadata deletion dependency acknowledgement failed`,
    });

    const acknowledgement = (
      acknowledgeResponse.body.data as
        | MetadataDeletionChangeSetResponse
        | undefined
    )?.acknowledgeMetadataChangeSetDependencies;

    if (!isDefined(acknowledgement)) {
      throw new Error(
        `${targetType} metadata deletion dependencies were not acknowledged.`,
      );
    }

    expectedVersion = acknowledgement.version;
  }

  const validateResponse = await makeMetadataAPIRequest(
    {
      query: VALIDATE_METADATA_DELETION_CHANGE_SET,
      variables: { id: prepared.id, expectedVersion },
    },
    token,
  );

  warnIfErrorButNotExpectedToFail({
    response: validateResponse,
    errorMessage: `${targetType} metadata deletion change set validation failed`,
  });

  const validated = (
    validateResponse.body.data as MetadataDeletionChangeSetResponse | undefined
  )?.validateMetadataChangeSet;

  if (!isDefined(validated) || validated.state !== 'VALIDATED') {
    throw new Error(
      `${targetType} metadata deletion change set was not validated.`,
    );
  }

  const approveResponse = await makeMetadataAPIRequest(
    {
      query: APPROVE_METADATA_DELETION_CHANGE_SET,
      variables: {
        id: prepared.id,
        expectedVersion: validated.version,
        applyToken: validated.applyToken,
      },
    },
    token,
  );

  warnIfErrorButNotExpectedToFail({
    response: approveResponse,
    errorMessage: `${targetType} metadata deletion change set approval failed`,
  });

  const approved = (
    approveResponse.body.data as MetadataDeletionChangeSetResponse | undefined
  )?.approveMetadataChangeSet;

  if (approved !== true) {
    throw new Error(
      `${targetType} metadata deletion change set was not approved.`,
    );
  }

  const applyResponse = await makeMetadataAPIRequest(
    {
      query: APPLY_METADATA_DELETION_CHANGE_SET,
      variables: {
        id: prepared.id,
        expectedVersion: validated.version + 1,
        applyToken: validated.applyToken,
      },
    },
    token,
  );

  warnIfErrorButNotExpectedToFail({
    response: applyResponse,
    errorMessage: `${targetType} metadata deletion change set apply failed`,
  });

  const applied = (
    applyResponse.body.data as MetadataDeletionChangeSetResponse | undefined
  )?.applyMetadataChangeSet;

  if (!isDefined(applied) || applied.status !== 'SUCCEEDED') {
    throw new Error(
      `${targetType} metadata deletion change set was not applied.`,
    );
  }
};
