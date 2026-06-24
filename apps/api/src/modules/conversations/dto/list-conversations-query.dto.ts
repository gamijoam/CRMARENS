import { IsIn, IsOptional, IsString } from "class-validator";

const conversationStatuses = ["open", "closed"] as const;
const channels = ["whatsapp", "instagram", "messenger"] as const;

export class ListConversationsQueryDto {
  @IsOptional()
  @IsIn(conversationStatuses)
  status?: (typeof conversationStatuses)[number];

  @IsOptional()
  @IsString()
  assignedUserId?: string;

  @IsOptional()
  @IsString()
  contactId?: string;

  @IsOptional()
  @IsIn(channels)
  channel?: (typeof channels)[number];
}
