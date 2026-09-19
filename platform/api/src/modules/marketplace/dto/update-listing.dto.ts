import { OmitType, PartialType } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { CreateListingDto } from './create-listing.dto';
import { blankToUndefined, LISTING_STATUSES, upper } from './marketplace.dto';

export class UpdateListingDto extends PartialType(OmitType(CreateListingDto, ['status'] as const)) {
  @ApiPropertyOptional({ enum: LISTING_STATUSES, description: 'Only the transitions in LISTING_TRANSITIONS are accepted' })
  @Transform(upper)
  @IsIn(LISTING_STATUSES as unknown as string[])
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'Alias of title' })
  @Transform(blankToUndefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'Alias of titleAr' })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  nameAr?: string;
}
