import { IsIn, IsOptional, IsString } from "class-validator";

const leadStatuses = ["open", "won", "lost"] as const;

export class ListLeadsQueryDto {
  @IsOptional()
  @IsString()
  pipelineId?: string;

  @IsOptional()
  @IsString()
  stageId?: string;

  @IsOptional()
  @IsIn(leadStatuses)
  status?: (typeof leadStatuses)[number];

  @IsOptional()
  @IsString()
  assignedUserId?: string;
}
