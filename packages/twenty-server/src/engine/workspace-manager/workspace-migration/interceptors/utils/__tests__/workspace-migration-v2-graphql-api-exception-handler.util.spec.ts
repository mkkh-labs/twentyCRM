import { WorkspaceMigrationV2ExceptionCode } from 'twenty-shared/metadata';

import {
  ConflictError,
  ErrorCode,
  InternalServerError,
} from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { workspaceMigrationV2GraphqlApiExceptionHandler } from 'src/engine/workspace-manager/workspace-migration/interceptors/utils/workspace-migration-v2-graphql-api-exception-handler.util';
import { WorkspaceMigrationV2Exception } from 'src/engine/workspace-manager/workspace-migration.exception';

const catchGraphqlError = (
  code: WorkspaceMigrationV2ExceptionCode,
): ConflictError | InternalServerError => {
  try {
    workspaceMigrationV2GraphqlApiExceptionHandler(
      new WorkspaceMigrationV2Exception('workspace migration failed', code),
    );
  } catch (error) {
    if (
      error instanceof ConflictError ||
      error instanceof InternalServerError
    ) {
      return error;
    }

    throw error;
  }

  throw new Error('Expected the GraphQL exception handler to throw.');
};

describe('workspaceMigrationV2GraphqlApiExceptionHandler', () => {
  it('preserves the change-set reason as a GraphQL conflict subcode', () => {
    const error = catchGraphqlError(
      WorkspaceMigrationV2ExceptionCode.CHANGE_SET_REQUIRED,
    );

    expect(error).toBeInstanceOf(ConflictError);
    expect(error.extensions).toMatchObject({
      code: ErrorCode.CONFLICT,
      subCode: WorkspaceMigrationV2ExceptionCode.CHANGE_SET_REQUIRED,
    });
  });

  it.each([
    WorkspaceMigrationV2ExceptionCode.BUILDER_INTERNAL_SERVER_ERROR,
    WorkspaceMigrationV2ExceptionCode.RUNNER_INTERNAL_SERVER_ERROR,
  ])('maps %s to an internal server error', (code) => {
    const error = catchGraphqlError(code);

    expect(error).toBeInstanceOf(InternalServerError);
    expect(error.extensions).toMatchObject({
      code: ErrorCode.INTERNAL_SERVER_ERROR,
      subCode: code,
    });
  });
});
