import { IsIn, IsOptional, IsString, MinLength } from "class-validator";

const channels = ["whatsapp", "instagram", "messenger"] as const;

export class CreateChannelConnectionDto {
  @IsIn(channels)
  channel!: (typeof channels)[number];

  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  externalAccountId?: string;
}
