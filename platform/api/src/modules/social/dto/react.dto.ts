import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum ReactionType {
  LIKE = 'LIKE',
  SAVE = 'SAVE',
  SHARE = 'SHARE',
}

export class ReactDto {
  @ApiProperty({ enum: ReactionType })
  @IsEnum(ReactionType)
  type: ReactionType;
}
