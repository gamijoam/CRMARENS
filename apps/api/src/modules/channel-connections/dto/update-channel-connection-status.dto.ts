import { IsIn } from "class-validator";

const statuses = ["active", "inactive"] as const;

export class UpdateChannelConnectionStatusDto {
  @IsIn(statuses)
  status!: (typeof statuses)[number];
}
