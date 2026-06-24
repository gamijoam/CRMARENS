import { IsIn } from "class-validator";

const messageStatuses = ["pending", "sent", "delivered", "read", "failed"] as const;

export class UpdateMessageStatusDto {
  @IsIn(messageStatuses)
  status!: (typeof messageStatuses)[number];
}
