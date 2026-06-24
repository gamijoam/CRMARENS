import { IsOptional, IsString } from "class-validator";

export class ListNotesQueryDto {
  @IsOptional()
  @IsString()
  contactId?: string;

  @IsOptional()
  @IsString()
  leadId?: string;
}
