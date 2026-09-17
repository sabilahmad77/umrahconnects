import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class AssignFamilyGroupDto {
  @ApiPropertyOptional({ nullable: true, description: 'Family group id, or null to unassign' })
  @IsOptional()
  @IsUUID()
  familyGroupId?: string | null;
}

export class AssignPilgrimToBookingDto {
  @ApiProperty()
  @IsUUID()
  bookingId: string;
}
