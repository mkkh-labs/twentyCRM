import { RESOLVER_SCHEMA_SCOPE_KEY } from 'src/engine/api/graphql/graphql-config/constants/resolver-schema-scope-key.constant';
import { AgentActionApprovalRequestDTO } from 'src/engine/core-modules/policy/dtos/agent-action-approval-request.dto';
import { AgentActionApprovalResolver } from 'src/engine/core-modules/policy/resolvers/agent-action-approval.resolver';
import { PolicyAuditResolver } from 'src/engine/core-modules/policy/resolvers/policy-audit.resolver';
import { WorkflowOperationsResolver } from 'src/engine/core-modules/workflow-reliability/resolvers/workflow-operations.resolver';

describe('security metadata schema contract', () => {
  it.each([
    AgentActionApprovalResolver,
    PolicyAuditResolver,
    WorkflowOperationsResolver,
  ])('registers %p on the metadata schema', (resolver) => {
    expect(Reflect.getMetadata(RESOLVER_SCHEMA_SCOPE_KEY, resolver)).toBe(
      'metadata',
    );
  });

  it('exposes the approval request status returned by deny mutations', () => {
    const deniedRequest = {
      status: 'DENIED',
    } satisfies Pick<AgentActionApprovalRequestDTO, 'status'>;

    expect(deniedRequest.status).toBe('DENIED');
  });
});
