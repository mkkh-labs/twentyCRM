import { WorkspaceMigrationV2ExceptionCode } from 'twenty-shared/metadata';

import { workspaceMigrationV2ExceptionCodeToHttpStatus } from 'src/engine/workspace-manager/workspace-migration/utils/workspace-migration-v2-exception-code-to-http-status.util';

describe('workspaceMigrationV2ExceptionCodeToHttpStatus', () => {
  it('returns 409 when a destructive change requires a change set', () => {
    expect(
      workspaceMigrationV2ExceptionCodeToHttpStatus(
        WorkspaceMigrationV2ExceptionCode.CHANGE_SET_REQUIRED,
      ),
    ).toBe(409);
  });

  it.each([
    WorkspaceMigrationV2ExceptionCode.BUILDER_INTERNAL_SERVER_ERROR,
    WorkspaceMigrationV2ExceptionCode.RUNNER_INTERNAL_SERVER_ERROR,
  ])('returns 500 for %s', (code) => {
    expect(workspaceMigrationV2ExceptionCodeToHttpStatus(code)).toBe(500);
  });
});
