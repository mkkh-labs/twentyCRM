import { type WorkflowRunStepLog } from 'twenty-shared/workflow';

import {
  isDefined,
  isValidUuid,
  resolveInput as resolveWorkflowInput,
} from 'twenty-shared/utils';
import { IsNull, type Repository } from 'typeorm';

import { type ToolOutput } from 'src/engine/core-modules/tool/types/tool-output.type';
import { type ToolExecutionContext } from 'src/engine/core-modules/tool/types/tool-execution-context.type';
import { WorkflowToolEffectService } from 'src/engine/core-modules/workflow-reliability/services/workflow-tool-effect.service';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';
import { type UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { WorkflowExecutionContextService } from 'src/modules/workflow/workflow-executor/services/workflow-execution-context.service';
import { type WorkflowRunInfo } from 'src/modules/workflow/workflow-executor/types/workflow-action-input';
import {
  WorkflowStepExecutorException,
  WorkflowStepExecutorExceptionCode,
} from 'src/modules/workflow/workflow-executor/exceptions/workflow-step-executor.exception';
import { type WorkflowSendEmailActionInput } from 'src/modules/workflow/workflow-executor/workflow-actions/mail-sender/types/workflow-send-email-action-input.type';
import {
  buildEmailStepLog,
  type EmailStepLogMode,
} from 'src/modules/workflow/workflow-executor/workflow-actions/mail-sender/utils/build-email-step-log.util';
import { resolveEmailBody } from 'src/modules/workflow/workflow-executor/workflow-actions/mail-sender/utils/resolve-email-body.util';
import { resolveEmailFiles } from 'src/modules/workflow/workflow-executor/workflow-actions/mail-sender/utils/resolve-email-files.util';
import { ToolBackedWorkflowAction } from 'src/modules/workflow/workflow-executor/workflow-actions/tool-backed/tool-backed.workflow-action';
import { WorkflowRunStepLogWorkspaceService } from 'src/modules/workflow/workflow-runner/workflow-run/workflow-run-step-log.workspace-service';
import { type WorkspaceMemberWorkspaceEntity } from 'src/modules/workspace-member/standard-objects/workspace-member.workspace-entity';

export abstract class EmailWorkflowActionBase extends ToolBackedWorkflowAction<WorkflowSendEmailActionInput> {
  protected constructor(
    loggerName: string,
    toolId: string,
    workflowRunStepLogService: WorkflowRunStepLogWorkspaceService,
    workflowToolEffectService: WorkflowToolEffectService,
    private readonly workspaceOrmManager: WorkspaceOrmManager,
    workflowExecutionContextService: WorkflowExecutionContextService,
    private readonly connectedAccountRepository: Repository<ConnectedAccountEntity>,
    private readonly userWorkspaceRepository: Repository<UserWorkspaceEntity>,
    permissionsService: PermissionsService,
  ) {
    super(
      loggerName,
      toolId,
      workflowRunStepLogService,
      workflowToolEffectService,
      workflowExecutionContextService,
      permissionsService,
    );
  }

  protected abstract getMode(): EmailStepLogMode;

  protected override async preprocessInput(
    rawInput: WorkflowSendEmailActionInput,
    context: Record<string, unknown>,
  ): Promise<WorkflowSendEmailActionInput> {
    const files = resolveEmailFiles(rawInput.files, context);

    const body = isDefined(rawInput.body)
      ? await resolveEmailBody(rawInput.body, context)
      : rawInput.body;

    return { ...rawInput, body, files };
  }

  protected override resolveInput(
    input: WorkflowSendEmailActionInput,
    context: Record<string, unknown>,
  ): WorkflowSendEmailActionInput {
    const { body, ...inputWithoutBody } = input;

    return {
      ...(resolveWorkflowInput(
        inputWithoutBody,
        context,
      ) as typeof inputWithoutBody),
      body,
    };
  }

  protected override async postprocessInput(
    resolvedInput: WorkflowSendEmailActionInput,
    runInfo: WorkflowRunInfo,
  ): Promise<WorkflowSendEmailActionInput> {
    if (!isDefined(resolvedInput.connectedAccountId)) {
      return resolvedInput;
    }

    const executionContext =
      await this.workflowExecutionContextService.getExecutionContext(runInfo);
    const connectedAccountId = await this.resolveSenderConnectedAccountId(
      resolvedInput.connectedAccountId,
      runInfo.workspaceId,
      executionContext.rolePermissionConfig,
    );

    return { ...resolvedInput, connectedAccountId };
  }

  protected override async buildToolExecutionContext(
    runInfo: WorkflowRunInfo,
  ): Promise<ToolExecutionContext> {
    const executionContext =
      await this.workflowExecutionContextService.getExecutionContext(runInfo);

    return executionContext.authContext.type === 'user'
      ? {
          workspaceId: runInfo.workspaceId,
          userWorkspaceId: executionContext.authContext.userWorkspaceId,
        }
      : { workspaceId: runInfo.workspaceId };
  }

  // The sender configured on an email step is either a connected account id
  // (static pick) or a workspace member id (from a resolved workflow variable).
  // When it is a workspace member id, resolve that member's first connected
  // account; otherwise return it unchanged so the regular connected account
  // flow applies. Only meaningful inside workflow email actions.
  protected async resolveSenderConnectedAccountId(
    senderId: string,
    workspaceId: string,
    rolePermissionConfig: Awaited<
      ReturnType<WorkflowExecutionContextService['getExecutionContext']>
    >['rolePermissionConfig'],
  ): Promise<string> {
    if (!isValidUuid(senderId)) {
      return senderId;
    }

    const workspaceMember = await this.findWorkspaceMemberById(
      senderId,
      rolePermissionConfig,
    );

    if (!isDefined(workspaceMember)) {
      return senderId;
    }

    const connectedAccountId =
      await this.findFirstConnectedAccountIdByWorkspaceMember(
        workspaceMember,
        workspaceId,
      );

    if (!isDefined(connectedAccountId)) {
      throw new WorkflowStepExecutorException(
        `No connected account found for workspace member '${senderId}'`,
        WorkflowStepExecutorExceptionCode.INVALID_STEP_INPUT,
      );
    }

    return connectedAccountId;
  }

  private async findWorkspaceMemberById(
    workspaceMemberId: string,
    rolePermissionConfig: Awaited<
      ReturnType<WorkflowExecutionContextService['getExecutionContext']>
    >['rolePermissionConfig'],
  ): Promise<WorkspaceMemberWorkspaceEntity | null> {
    const workspaceMemberRepository =
      this.workspaceOrmManager.getRepository<WorkspaceMemberWorkspaceEntity>(
        'workspaceMember',
        rolePermissionConfig,
      );

    return workspaceMemberRepository.findOne({
      where: { id: workspaceMemberId },
    });
  }

  private async findFirstConnectedAccountIdByWorkspaceMember(
    workspaceMember: WorkspaceMemberWorkspaceEntity,
    workspaceId: string,
  ): Promise<string | null> {
    const userWorkspace = await this.userWorkspaceRepository.findOne({
      where: { userId: workspaceMember.userId, workspaceId },
    });

    if (!isDefined(userWorkspace)) {
      return null;
    }

    const connectedAccount = await this.connectedAccountRepository.findOne({
      where: {
        userWorkspaceId: userWorkspace.id,
        workspaceId,
        archivedAt: IsNull(),
      },
      order: { createdAt: 'ASC' },
    });

    return connectedAccount?.id ?? null;
  }

  protected buildStepLog({
    input,
    output,
    durationMs,
  }: {
    input: WorkflowSendEmailActionInput;
    output: ToolOutput;
    durationMs: number;
  }): WorkflowRunStepLog {
    return buildEmailStepLog({
      mode: this.getMode(),
      input,
      output,
      durationMs,
    });
  }
}
