import { IsIn, IsOptional, IsString, MinLength } from "class-validator";

const channelTypes = ["whatsapp", "instagram", "messenger"] as const;

export class ContactChannelDto {
  @IsIn(channelTypes)
  channel!: (typeof channelTypes)[number];

  @IsString()
  @MinLength(1)
  externalId!: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  username?: string;
}
