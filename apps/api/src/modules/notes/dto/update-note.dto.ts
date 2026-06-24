import { IsString, MinLength } from "class-validator";

export class UpdateNoteDto {
  @IsString()
  @MinLength(2)
  body!: string;
}
