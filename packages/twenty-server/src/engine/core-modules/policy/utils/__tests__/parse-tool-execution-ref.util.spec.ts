import { parseToolExecutionRef } from 'src/engine/core-modules/policy/utils/parse-tool-execution-ref.util';

describe('parseToolExecutionRef', () => {
  it('parses one exact database operation', () => {
    expect(
      parseToolExecutionRef({
        actorId: '11111111-1111-4111-8111-111111111111',
        executionKind: 'database_crud',
        objectNameSingular: 'company',
        databaseOperation: 'delete_one',
        arguments: {},
        expiresAt: '2026-09-01T12:00:00.000Z',
      }),
    ).toEqual({
      kind: 'database_crud',
      objectNameSingular: 'company',
      operation: 'delete_one',
    });
  });

  it('rejects ambiguous execution references', () => {
    expect(() =>
      parseToolExecutionRef({
        actorId: '11111111-1111-4111-8111-111111111111',
        executionKind: 'static',
        toolId: 'send-email',
        logicFunctionId: '22222222-2222-4222-8222-222222222222',
        arguments: {},
        expiresAt: '2026-09-01T12:00:00.000Z',
      }),
    ).toThrow('malformed or ambiguous');
  });
});
