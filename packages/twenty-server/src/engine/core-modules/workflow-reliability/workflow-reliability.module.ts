import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WorkflowEffectExecutionEntity } from 'src/engine/core-modules/workflow-reliability/entities/workflow-effect-execution.entity';
import { WorkflowEffectService } from 'src/engine/core-modules/workflow-reliability/services/workflow-effect.service';
import { WorkflowToolEffectService } from 'src/engine/core-modules/workflow-reliability/services/workflow-tool-effect.service';
import { WorkflowProviderCapabilityRegistryService } from 'src/engine/core-modules/workflow-reliability/services/workflow-provider-capability-registry.service';
import { provideWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/provide-workspace-scoped-repository';
import { WorkflowOperationsResolver } from 'src/engine/core-modules/workflow-reliability/resolvers/workflow-operations.resolver';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { PolicyModule } from 'src/engine/core-modules/policy/policy.module';

@Module({
  imports: [
    PermissionsModule,
    PolicyModule,
    TypeOrmModule.forFeature([WorkflowEffectExecutionEntity]),
  ],
  providers: [
    WorkflowEffectService,
    WorkflowOperationsResolver,
    WorkflowProviderCapabilityRegistryService,
    WorkflowToolEffectService,
    provideWorkspaceScopedRepository(WorkflowEffectExecutionEntity),
  ],
  exports: [
    WorkflowEffectService,
    WorkflowProviderCapabilityRegistryService,
    WorkflowToolEffectService,
  ],
})
export class WorkflowReliabilityModule {}
