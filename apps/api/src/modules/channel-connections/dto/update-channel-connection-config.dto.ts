import { IsOptional, IsString, MinLength } from "class-validator";

export class UpdateChannelConnectionConfigDto {
  @IsOptional()
  @IsString()
  @MinLength(10)
  accessToken?: string;

  @IsOptional()
  @IsString()
  externalAccountId?: string;
}
