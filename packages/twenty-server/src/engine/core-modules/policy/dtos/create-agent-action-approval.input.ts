import { Field, InputType } from '@nestjs/graphql';

import {
  IsDateString,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import GraphQLJSON from 'graphql-type-json';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@InputType()
export class CreateAgentActionApprovalInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  actorId: string;

  @Field()
  @IsIn(['database_crud', 'logic_function', 'static'])
  executionKind: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  objectNameSingular?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  databaseOperation?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsUUID()
  logicFunctionId?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  toolId?: string;

  @Field(() => GraphQLJSON)
  @IsObject()
  arguments: Record<string, unknown>;

  @Field()
  @IsDateString()
  expiresAt: string;
}
