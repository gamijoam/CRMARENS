import { ArrayMinSize, IsArray, IsString } from "class-validator";

export class ReorderPipelineStagesDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  stageIds!: string[];
}
