import { DATABASE_CRUD_OPERATIONS } from 'twenty-shared/ai';
import { isNonEmptyString } from '@sniptt/guards';

import { type CreateAgentActionApprovalInput } from 'src/engine/core-modules/policy/dtos/create-agent-action-approval.input';
import { type DatabaseCrudOperation } from 'src/engine/core-modules/tool-provider/constants/database-crud-operation.const';
import { type ToolExecutionRef } from 'src/engine/core-modules/tool-provider/types/tool-execution-ref.type';

export const parseToolExecutionRef = (
  input: CreateAgentActionApprovalInput,
): ToolExecutionRef => {
  if (
    input.executionKind === 'database_crud' &&
    isNonEmptyString(input.objectNameSingular) &&
    isNonEmptyString(input.databaseOperation) &&
    DATABASE_CRUD_OPERATIONS.includes(input.databaseOperation as never) &&
    input.logicFunctionId === undefined &&
    input.toolId === undefined
  ) {
    return {
      kind: 'database_crud',
      objectNameSingular: input.objectNameSingular,
      operation: input.databaseOperation as DatabaseCrudOperation,
    };
  }

  if (
    input.executionKind === 'logic_function' &&
    isNonEmptyString(input.logicFunctionId) &&
    input.objectNameSingular === undefined &&
    input.databaseOperation === undefined &&
    input.toolId === undefined
  ) {
    return { kind: 'logic_function', logicFunctionId: input.logicFunctionId };
  }

  if (
    input.executionKind === 'static' &&
    isNonEmptyString(input.toolId) &&
    input.objectNameSingular === undefined &&
    input.databaseOperation === undefined &&
    input.logicFunctionId === undefined
  ) {
    return { kind: 'static', toolId: input.toolId };
  }

  throw new Error('Tool execution reference is malformed or ambiguous.');
};
