import { IsIn, IsOptional, IsString } from "class-validator";

const taskStatuses = ["open", "done", "canceled"] as const;

export class ListTasksQueryDto {
  @IsOptional()
  @IsString()
  contactId?: string;

  @IsOptional()
  @IsString()
  leadId?: string;

  @IsOptional()
  @IsString()
  assignedUserId?: string;

  @IsOptional()
  @IsIn(taskStatuses)
  status?: (typeof taskStatuses)[number];
}
