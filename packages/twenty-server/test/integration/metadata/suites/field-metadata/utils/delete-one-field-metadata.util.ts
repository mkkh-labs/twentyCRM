import {
  type DeleteOneFieldFactoryInput,
  deleteOneFieldMetadataQueryFactory,
} from 'test/integration/metadata/suites/field-metadata/utils/delete-one-field-metadata-query-factory.util';
import { makeMetadataAPIRequest } from 'test/integration/metadata/suites/utils/make-metadata-api-request.util';
import { type PerformMetadataQueryParams } from 'test/integration/metadata/types/perform-metadata-query.type';
import { applyMetadataDeletionChangeSet } from 'test/integration/metadata/utils/apply-metadata-deletion-change-set.util';
import { warnIfNoErrorButExpectedToFail } from 'test/integration/metadata/utils/warn-if-no-error-but-expected-to-fail.util';

export const deleteOneFieldMetadata = async ({
  input,
  gqlFields,
  expectToFail = false,
  token,
}: PerformMetadataQueryParams<DeleteOneFieldFactoryInput>) => {
  if (expectToFail === false) {
    await applyMetadataDeletionChangeSet({
      targetId: input.idToDelete,
      targetType: 'FIELD',
      token,
    });

    return {
      data: { deleteOneField: { id: input.idToDelete } },
      errors: undefined,
    };
  }

  const graphqlOperation = deleteOneFieldMetadataQueryFactory({
    input,
    gqlFields,
  });

  const response = await makeMetadataAPIRequest(graphqlOperation, token);

  warnIfNoErrorButExpectedToFail({
    response,
    errorMessage: 'Field Metadata deletion should have failed but did not',
  });

  return { data: response.body.data, errors: response.body.errors };
};
