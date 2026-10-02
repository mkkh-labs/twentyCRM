import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ApplicationModule } from 'src/engine/core-modules/application/application.module';
import { UserWorkspaceModule } from 'src/engine/core-modules/user-workspace/user-workspace.module';
import { AiAgentExecutionModule } from 'src/engine/metadata-modules/ai/ai-agent-execution/ai-agent-execution.module';
import { AgentEntity } from 'src/engine/metadata-modules/ai/ai-agent/entities/agent.entity';
import { RoleModule } from 'src/engine/metadata-modules/role/role.module';
import { provideWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/provide-workspace-scoped-repository';
import { UserRoleModule } from 'src/engine/metadata-modules/user-role/user-role.module';
import { WorkflowExecutionContextService } from 'src/modules/workflow/workflow-executor/services/workflow-execution-context.service';
import { WorkflowRunModule } from 'src/modules/workflow/workflow-runner/workflow-run/workflow-run.module';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { WorkflowReliabilityModule } from 'src/engine/core-modules/workflow-reliability/workflow-reliability.module';
import { WorkflowActionEffectService } from 'src/modules/workflow/workflow-executor/services/workflow-action-effect.service';

import { AiAgentWorkflowAction } from './ai-agent.workflow-action';

@Module({
  imports: [
    ApplicationModule,
    AiAgentExecutionModule,
    TypeOrmModule.forFeature([AgentEntity]),
    WorkflowRunModule,
    UserWorkspaceModule,
    UserRoleModule,
    RoleModule,
    PermissionsModule,
    WorkflowReliabilityModule,
  ],
  providers: [
    WorkflowExecutionContextService,
    WorkflowActionEffectService,
    AiAgentWorkflowAction,
    provideWorkspaceScopedRepository(AgentEntity),
  ],
  exports: [AiAgentWorkflowAction],
})
export class AiAgentActionModule {}
