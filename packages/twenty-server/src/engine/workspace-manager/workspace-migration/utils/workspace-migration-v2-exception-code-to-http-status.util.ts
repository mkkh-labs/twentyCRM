import { WorkspaceMigrationV2ExceptionCode } from 'twenty-shared/metadata';
import { assertUnreachable } from 'twenty-shared/utils';

export const workspaceMigrationV2ExceptionCodeToHttpStatus = (
  code: WorkspaceMigrationV2ExceptionCode,
): number => {
  switch (code) {
    case WorkspaceMigrationV2ExceptionCode.CHANGE_SET_REQUIRED:
      return 409;
    case WorkspaceMigrationV2ExceptionCode.BUILDER_INTERNAL_SERVER_ERROR:
    case WorkspaceMigrationV2ExceptionCode.RUNNER_INTERNAL_SERVER_ERROR:
      return 500;
    default:
      return assertUnreachable(code);
  }
};
