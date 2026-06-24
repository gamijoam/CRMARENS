import { IsOptional, IsString } from "class-validator";

export class AssignLeadDto {
  @IsOptional()
  @IsString()
  assignedUserId?: string;
}
