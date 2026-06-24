import { IsIn, IsOptional, IsString } from "class-validator";

const channels = ["whatsapp", "instagram", "messenger"] as const;

export class CreateConversationDto {
  @IsString()
  contactId!: string;

  @IsIn(channels)
  channel!: (typeof channels)[number];

  @IsOptional()
  @IsString()
  channelConnectionId?: string;

  @IsOptional()
  @IsString()
  assignedUserId?: string;
}
