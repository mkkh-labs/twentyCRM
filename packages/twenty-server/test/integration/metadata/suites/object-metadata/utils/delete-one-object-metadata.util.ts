import {
  type DeleteOneObjectFactoryInput,
  deleteOneObjectMetadataQueryFactory,
} from 'test/integration/metadata/suites/object-metadata/utils/delete-one-object-metadata-query-factory.util';
import { makeMetadataAPIRequest } from 'test/integration/metadata/suites/utils/make-metadata-api-request.util';
import { type PerformMetadataQueryParams } from 'test/integration/metadata/types/perform-metadata-query.type';
import { applyMetadataDeletionChangeSet } from 'test/integration/metadata/utils/apply-metadata-deletion-change-set.util';
import { warnIfNoErrorButExpectedToFail } from 'test/integration/metadata/utils/warn-if-no-error-but-expected-to-fail.util';

export const deleteOneObjectMetadata = async ({
  input,
  gqlFields,
  expectToFail = false,
  token,
}: PerformMetadataQueryParams<DeleteOneObjectFactoryInput>) => {
  if (expectToFail === false) {
    await applyMetadataDeletionChangeSet({
      targetId: input.idToDelete,
      targetType: 'OBJECT',
      token,
    });

    return {
      data: { deleteOneObject: { id: input.idToDelete } },
      errors: undefined,
    };
  }

  const graphqlOperation = deleteOneObjectMetadataQueryFactory({
    input,
    gqlFields,
  });

  const response = await makeMetadataAPIRequest(graphqlOperation, token);

  warnIfNoErrorButExpectedToFail({
    response,
    errorMessage: 'Object Metadata deletion should have failed but did not',
  });

  return { data: response.body.data, errors: response.body.errors };
};
