import { Field, InputType } from '@nestjs/graphql';

import { IsIn, IsUUID } from 'class-validator';

import { type MetadataDeletionTargetType } from 'src/engine/core-modules/metadata-change-set/services/metadata-deletion-plan.service';

@InputType()
export class PrepareMetadataDeletionChangeSetInput {
  @Field(() => String)
  @IsIn(['OBJECT', 'FIELD', 'INDEX'])
  targetType: MetadataDeletionTargetType;

  @Field()
  @IsUUID()
  targetId: string;
}
