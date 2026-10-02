import { Field, ObjectType } from '@nestjs/graphql';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@ObjectType('AgentActionApproval')
export class AgentActionApprovalDTO {
  @Field(() => UUIDScalarType)
  id: string;

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
}
