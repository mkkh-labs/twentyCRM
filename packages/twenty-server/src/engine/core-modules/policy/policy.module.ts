import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AgentActionApprovalEntity } from 'src/engine/core-modules/policy/entities/agent-action-approval.entity';
import { AgentActionApprovalRequestEntity } from 'src/engine/core-modules/policy/entities/agent-action-approval-request.entity';
import { PolicyAuditEventEntity } from 'src/engine/core-modules/policy/entities/policy-audit-event.entity';
import { AgentActionApprovalService } from 'src/engine/core-modules/policy/services/agent-action-approval.service';
import { AgentActionApprovalRequestService } from 'src/engine/core-modules/policy/services/agent-action-approval-request.service';
import { AgentActionPolicyService } from 'src/engine/core-modules/policy/services/agent-action-policy.service';
import { PolicyAuditService } from 'src/engine/core-modules/policy/services/policy-audit.service';
import { PolicyContextService } from 'src/engine/core-modules/policy/services/policy-context.service';
import { PolicyCorrelationService } from 'src/engine/core-modules/policy/services/policy-correlation.service';
import { PolicyDecisionService } from 'src/engine/core-modules/policy/services/policy-decision.service';
import { ProtectedOperationService } from 'src/engine/core-modules/policy/services/protected-operation.service';
import { provideWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/provide-workspace-scoped-repository';
import { MetricsModule } from 'src/engine/core-modules/metrics/metrics.module';
import { PolicyTelemetryService } from 'src/engine/core-modules/policy/services/policy-telemetry.service';
import { AgentActionApprovalResolver } from 'src/engine/core-modules/policy/resolvers/agent-action-approval.resolver';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { PolicyAuditResolver } from 'src/engine/core-modules/policy/resolvers/policy-audit.resolver';
import { FeatureFlagModule } from 'src/engine/core-modules/feature-flag/feature-flag.module';
import { ToolPolicyExecutionService } from 'src/engine/core-modules/tool-provider/services/tool-policy-execution.service';
import { TransactionalOutboxModule } from 'src/engine/core-modules/transactional-outbox/transactional-outbox.module';

@Module({
  imports: [
    MetricsModule,
    FeatureFlagModule,
    PermissionsModule,
    TransactionalOutboxModule,
    TypeOrmModule.forFeature([
      AgentActionApprovalEntity,
      AgentActionApprovalRequestEntity,
      PolicyAuditEventEntity,
    ]),
  ],
  providers: [
    AgentActionApprovalService,
    AgentActionApprovalRequestService,
    AgentActionApprovalResolver,
    AgentActionPolicyService,
    PolicyAuditService,
    PolicyAuditResolver,
    PolicyContextService,
    PolicyCorrelationService,
    PolicyDecisionService,
    PolicyTelemetryService,
    ProtectedOperationService,
    ToolPolicyExecutionService,
    provideWorkspaceScopedRepository(AgentActionApprovalEntity),
    provideWorkspaceScopedRepository(AgentActionApprovalRequestEntity),
    provideWorkspaceScopedRepository(PolicyAuditEventEntity),
  ],
  exports: [
    AgentActionApprovalService,
    AgentActionApprovalRequestService,
    AgentActionPolicyService,
    PolicyAuditService,
    PolicyContextService,
    PolicyCorrelationService,
    PolicyDecisionService,
    PolicyTelemetryService,
    ProtectedOperationService,
    ToolPolicyExecutionService,
  ],
})
export class PolicyModule {}
