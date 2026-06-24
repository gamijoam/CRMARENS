import { IsIn, IsObject, IsOptional, IsString, MinLength } from "class-validator";

const directions = ["inbound", "outbound"] as const;
const messageTypes = ["text", "image", "audio", "video", "document", "interactive"] as const;
const messageStatuses = ["pending", "sent", "delivered", "read", "failed"] as const;

export class CreateMessageDto {
  @IsIn(directions)
  direction!: (typeof directions)[number];

  @IsOptional()
  @IsString()
  externalMessageId?: string;

  @IsOptional()
  @IsIn(messageTypes)
  type?: (typeof messageTypes)[number];

  @IsOptional()
  @IsString()
  @MinLength(1)
  text?: string;

  @IsOptional()
  @IsIn(messageStatuses)
  status?: (typeof messageStatuses)[number];

  @IsOptional()
  @IsObject()
  rawPayload?: Record<string, unknown>;
}
