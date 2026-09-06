import { Field, InputType, Int } from '@nestjs/graphql';

import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import GraphQLJSON from 'graphql-type-json';

@InputType()
export class CreateMetadataChangeSetInput {
  @Field(() => Int)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  baseMetadataVersion: number;

  @Field()
  @IsString()
  applicationUniversalIdentifier: string;

  @Field(() => GraphQLJSON)
  @IsObject()
  migrationPlan: Record<string, unknown>;

  @Field(() => GraphQLJSON, { nullable: true })
  @IsObject()
  @IsOptional()
  rollbackPlan?: Record<string, unknown>;

  @Field(() => String, { nullable: true })
  @IsIn(['ROLLBACK', 'FORWARD_FIX'])
  @IsOptional()
  recoveryStrategy?: 'ROLLBACK' | 'FORWARD_FIX';

  @Field({ nullable: true })
  @Matches(/^[a-f0-9]{64}$/)
  @IsOptional()
  dependencyResolutionDigest?: string;
}
