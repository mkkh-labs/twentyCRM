import { WorkspaceMigrationV2ExceptionCode } from 'twenty-shared/metadata';
import { assertUnreachable } from 'twenty-shared/utils';

import {
  ConflictError,
  InternalServerError,
} from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { type WorkspaceMigrationV2Exception } from 'src/engine/workspace-manager/workspace-migration.exception';

export const workspaceMigrationV2GraphqlApiExceptionHandler = (
  exception: WorkspaceMigrationV2Exception,
): never => {
  switch (exception.code) {
    case WorkspaceMigrationV2ExceptionCode.CHANGE_SET_REQUIRED:
      throw new ConflictError(exception);
    case WorkspaceMigrationV2ExceptionCode.BUILDER_INTERNAL_SERVER_ERROR:
    case WorkspaceMigrationV2ExceptionCode.RUNNER_INTERNAL_SERVER_ERROR:
      throw new InternalServerError(exception);
    default:
      return assertUnreachable(exception.code);
  }
};
