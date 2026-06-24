import { IsIn } from "class-validator";

const leadStatuses = ["open", "won", "lost"] as const;

export class UpdateLeadStatusDto {
  @IsIn(leadStatuses)
  status!: (typeof leadStatuses)[number];
}
