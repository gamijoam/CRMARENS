import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested
} from "class-validator";

export class CreatePipelineStageDto {
  @IsString()
  @MinLength(2)
  name!: string;
}

export class CreatePipelineDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePipelineStageDto)
  stages?: CreatePipelineStageDto[];
}
