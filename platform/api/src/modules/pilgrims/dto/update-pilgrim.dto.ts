import { PartialType } from '@nestjs/swagger';
import { CreatePilgrimDto } from './create-pilgrim.dto';

export class UpdatePilgrimDto extends PartialType(CreatePilgrimDto) {}
