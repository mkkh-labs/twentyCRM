import { type DatabaseCrudOperation } from 'src/engine/core-modules/tool-provider/constants/database-crud-operation.const';
import { type ToolExecutionRef } from 'src/engine/core-modules/tool-provider/types/tool-execution-ref.type';
import { type PolicyRiskClass } from 'src/engine/core-modules/policy/types/policy-context.type';

export type ResolvedAgentAction = Readonly<{
  action: string;
  target: string;
  riskClass: PolicyRiskClass;
}>;

const DATABASE_OPERATION_RISK: Record<DatabaseCrudOperation, PolicyRiskClass> =
  {
    find_many: 'R0',
    find_one: 'R0',
    group_by: 'R0',
    create_one: 'R1',
    update_one: 'R1',
    create_many: 'R2',
    update_many: 'R2',
    upsert_many: 'R2',
    delete_one: 'R3',
    delete_many: 'R3',
  };

const STATIC_TOOL_RISK: Readonly<Record<string, PolicyRiskClass>> = {
  search_help_center: 'R0',
  navigate_app: 'R0',
  extract_json_paths: 'R0',
  search_output: 'R0',
  draft_email: 'R2',
  send_email: 'R2',
  create_calendar_event: 'R2',
  save_campaign: 'R2',
  code_interpreter: 'R2',
  ai_workflow_agent: 'R2',
  http_request: 'R3',
};

export const resolveAgentAction = (
  executionRef: ToolExecutionRef,
): ResolvedAgentAction => {
  if (executionRef.kind === 'database_crud') {
    return {
      action: `database.${executionRef.operation}`,
      target: `database:${executionRef.objectNameSingular}`,
      riskClass: DATABASE_OPERATION_RISK[executionRef.operation],
    };
  }

  if (executionRef.kind === 'logic_function') {
    return {
      action: 'logic-function.execute',
      target: `logic-function:${executionRef.logicFunctionId}`,
      riskClass: 'R2',
    };
  }

  return {
    action: `static.${executionRef.toolId}`,
    target: `static:${executionRef.toolId}`,
    riskClass: STATIC_TOOL_RISK[executionRef.toolId] ?? 'R3',
  };
};
