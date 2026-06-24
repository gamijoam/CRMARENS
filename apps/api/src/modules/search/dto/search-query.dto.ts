import { IsOptional, IsString, MinLength } from "class-validator";

export class SearchQueryDto {
  @IsString()
  @MinLength(2)
  q!: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  assignedUserId?: string;

  @IsOptional()
  @IsString()
  channel?: string;
}
