import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

export class MarkNotificationsReadDto {
  @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) ids: string[];
}
