import { Field, ObjectType } from '@nestjs/graphql';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { type AgentActionApprovalRequestStatus } from 'src/engine/core-modules/policy/entities/agent-action-approval-request.entity';

@ObjectType('AgentActionApprovalRequest')
export class AgentActionApprovalRequestDTO {
  @Field(() => UUIDScalarType)
  id: string;

  @Field(() => UUIDScalarType)
  actorId: string;

  @Field()
  action: string;

  @Field()
  target: string;

  @Field()
  riskClass: string;

  @Field()
  actionDigest: string;

  @Field()
  expiresAt: Date;

  @Field()
  createdAt: Date;

  @Field(() => String)
  status: AgentActionApprovalRequestStatus;

  @Field(() => UUIDScalarType, { nullable: true })
  workflowRunId: string | null;

  @Field(() => String, { nullable: true })
  workflowStepId: string | null;

  @Field(() => UUIDScalarType, { nullable: true })
  rootCorrelationId: string | null;

  @Field(() => UUIDScalarType, { nullable: true })
  originPolicyDecisionId: string | null;
}
