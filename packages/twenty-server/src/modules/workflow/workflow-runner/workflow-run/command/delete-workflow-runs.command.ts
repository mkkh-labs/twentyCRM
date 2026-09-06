import { Command, Option } from 'nest-commander';
import { LessThan } from 'typeorm';

import { ProvisionedWorkspaceCommandRunner } from 'src/database/commands/command-runners/provisioned-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { type WorkflowRunWorkspaceEntity } from 'src/modules/workflow/common/standard-objects/workflow-run.workspace-entity';
import { WorkflowServiceAuthorityWorkspaceService } from 'src/modules/workflow/common/workspace-services/workflow-service-authority.workspace-service';

@Command({
  name: 'workflow:delete-workflow-runs',
  description: 'Delete all workflow runs',
})
export class DeleteWorkflowRunsCommand extends ProvisionedWorkspaceCommandRunner {
  private createdBeforeDate: string | undefined;

  constructor(
    private readonly workspaceOrmManager: WorkspaceOrmManager,
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly workflowServiceAuthorityWorkspaceService: WorkflowServiceAuthorityWorkspaceService,
  ) {
    super(workspaceIteratorService);
  }

  @Option({
    flags: '--created-before [created_before]',
    description:
      'created before. Delete workflow runs created before that date (YYYY-MM-DD)',
    required: false,
  })
  parseCreatedBefore(val: string): string | undefined {
    const date = new Date(val);

    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date format: ${val}`);
    }

    const createdBeforeDate = date.toISOString();

    this.createdBeforeDate = createdBeforeDate;

    return createdBeforeDate;
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    const { authContext, rolePermissionConfig } =
      await this.workflowServiceAuthorityWorkspaceService.resolve(workspaceId);

    await this.workspaceOrmManager.executeInWorkspaceContext(async () => {
      try {
        const workflowRunRepository =
          this.workspaceOrmManager.getRepository<WorkflowRunWorkspaceEntity>(
            'workflowRun',
            rolePermissionConfig,
          );

        const createdAtCondition = {
          createdAt: LessThan(
            this.createdBeforeDate || new Date().toISOString(),
          ),
        };

        const workflowRunCount = await workflowRunRepository.count({
          where: createdAtCondition,
        });

        if (!options.dryRun && workflowRunCount > 0) {
          await workflowRunRepository.delete(createdAtCondition);
        }

        this.logger.log(
          `${options.dryRun ? ' (DRY RUN): ' : ''}Deleted ${workflowRunCount} workflow runs`,
        );
      } catch (error) {
        this.logger.error('Error while deleting workflowRun', error);
      }
    }, authContext);
  }
}
