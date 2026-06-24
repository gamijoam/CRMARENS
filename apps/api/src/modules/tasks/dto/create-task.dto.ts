import { Type } from "class-transformer";
import {
  IsDate,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf
} from "class-validator";

export class CreateTaskDto {
  @IsOptional()
  @IsString()
  contactId?: string;

  @IsOptional()
  @IsString()
  leadId?: string;

  @IsString()
  @MinLength(2)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  dueAt?: Date;

  @IsOptional()
  @IsString()
  assignedUserId?: string;

  @ValidateIf((dto: CreateTaskDto) => !dto.contactId && !dto.leadId)
  @IsString({ message: "contactId or leadId is required" })
  targetId?: never;
}
