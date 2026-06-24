import { IsOptional, IsString } from "class-validator";

export class AssignConversationDto {
  @IsOptional()
  @IsString()
  assignedUserId?: string;
}
