import { Field, InputType } from '@nestjs/graphql';

import { IsDateString, IsUUID } from 'class-validator';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@InputType()
export class ApproveAgentActionRequestInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  requestId: string;

  @Field()
  @IsDateString()
  expiresAt: string;
}
