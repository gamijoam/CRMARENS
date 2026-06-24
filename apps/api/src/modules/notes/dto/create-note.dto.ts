import { IsOptional, IsString, MinLength, ValidateIf } from "class-validator";

export class CreateNoteDto {
  @IsOptional()
  @IsString()
  contactId?: string;

  @IsOptional()
  @IsString()
  leadId?: string;

  @IsString()
  @MinLength(2)
  body!: string;

  @ValidateIf((dto: CreateNoteDto) => !dto.contactId && !dto.leadId)
  @IsString({ message: "contactId or leadId is required" })
  targetId?: never;
}
