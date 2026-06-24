import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

export class ReportSummaryQueryDto {
  @IsInt()
  @IsOptional()
  @Max(365)
  @Min(1)
  @Type(() => Number)
  days = 30;
}
