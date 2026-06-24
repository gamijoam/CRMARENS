import { IsString } from "class-validator";

export class MoveLeadStageDto {
  @IsString()
  stageId!: string;
}
