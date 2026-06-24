import { IsIn } from "class-validator";

const taskStatuses = ["open", "done", "canceled"] as const;

export class UpdateTaskStatusDto {
  @IsIn(taskStatuses)
  status!: (typeof taskStatuses)[number];
}
