import { Type } from "class-transformer";
import { IsArray, IsEmail, IsOptional, IsString, MinLength, ValidateNested } from "class-validator";

export class ImportContactRowDto {
  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class ImportContactsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportContactRowDto)
  contacts!: ImportContactRowDto[];
}
