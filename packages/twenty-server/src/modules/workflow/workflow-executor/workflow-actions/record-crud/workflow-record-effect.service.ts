import { Injectable } from '@nestjs/common';

import { ToolCategory } from 'twenty-shared/ai';

import { type DatabaseCrudOperation } from 'src/engine/core-modules/tool-provider/constants/database-crud-operation.const';
import { WorkflowToolEffectService } from 'src/engine/core-modules/workflow-reliability/services/workflow-tool-effect.service';
import { type ToolOutput } from 'src/engine/core-modules/tool/types/tool-output.type';
import { getObjectsPermissionsFromRolePermissionConfig } from 'src/engine/twenty-orm/utils/get-objects-permissions-from-role-permission-config.util';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { type WorkflowExecutionContext } from 'src/modules/workflow/workflow-executor/types/workflow-execution-context.type';
import { type WorkflowRunInfo } from 'src/modules/workflow/workflow-executor/types/workflow-action-input';

type ProtectedRecordOperation = Extract<
  DatabaseCrudOperation,
  'create_one' | 'update_one' | 'upsert_many' | 'delete_one'
>;

@Injectable()
export class WorkflowRecordEffectService {
  constructor(
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly workflowToolEffectService: WorkflowToolEffectService,
  ) {}

  async execute({
    operation,
    objectName,
    objectMetadataId,
    fieldMetadataIds,
    recordIds,
    actionInput,
    executionContext,
    runInfo,
    stepId,
    execute,
  }: Readonly<{
    operation: ProtectedRecordOperation;
    objectName: string;
    objectMetadataId: string;
    fieldMetadataIds: readonly string[];
    recordIds?: readonly string[];
    actionInput: Readonly<Record<string, unknown>>;
    executionContext: WorkflowExecutionContext;
    runInfo: WorkflowRunInfo;
    stepId: string;
    execute: () => Promise<ToolOutput>;
  }>): Promise<ToolOutput> {
    const { rolesPermissions } =
      await this.workspaceCacheService.getOrRecompute(runInfo.workspaceId, [
        'rolesPermissions',
      ]);
    const objectPermissions = getObjectsPermissionsFromRolePermissionConfig({
      rolesPermissions,
      rolePermissionConfig: executionContext.rolePermissionConfig,
    });
    const permission = objectPermissions[objectMetadataId];
    const roleAllowed =
      permission !== undefined &&
      this.hasOperationPermission(operation, permission) &&
      fieldMetadataIds.every(
        (fieldMetadataId) =>
          permission.restrictedFields[fieldMetadataId]?.canUpdate !== false,
      );

    return this.workflowToolEffectService.execute({
      workspaceId: runInfo.workspaceId,
      workflowRunId: runInfo.workflowRunId,
      stepId,
      providerClass: `workflow-record-${operation}`,
      actionInput,
      descriptor: {
        name: `workflow_${operation}_${objectName}`,
        label: `Workflow ${operation}`,
        description: `Execute ${operation} on ${objectName}`,
        category: ToolCategory.DATABASE_CRUD,
        executionRef: {
          kind: 'database_crud',
          operation,
          objectNameSingular: objectName,
        },
      },
      policyContext: {
        workspaceId: runInfo.workspaceId,
        roleId: executionContext.roleId,
        rolePermissionConfig: executionContext.rolePermissionConfig,
        authContext: executionContext.authContext,
        actorContext: executionContext.initiator,
        rootCorrelationId: runInfo.rootCorrelationId ?? runInfo.workflowRunId,
        jobId: runInfo.jobId,
        workflowRunId: runInfo.workflowRunId,
        approvalId: runInfo.approvalId,
        automationAllowed: true,
        objectMetadataId,
        recordIds,
        affectedFieldMetadataIds: fieldMetadataIds,
      },
      roleAllowed,
      execute,
    });
  }

  private hasOperationPermission(
    operation: ProtectedRecordOperation,
    permission: Readonly<{
      canUpdateObjectRecords: boolean;
      canSoftDeleteObjectRecords: boolean;
    }>,
  ): boolean {
    return operation === 'delete_one'
      ? permission.canSoftDeleteObjectRecords
      : permission.canUpdateObjectRecords;
  }
}
