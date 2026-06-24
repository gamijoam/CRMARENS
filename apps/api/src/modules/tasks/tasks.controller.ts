import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "../../shared/authenticated-user";
import { CurrentUser } from "../../shared/current-user.decorator";
import { JwtAuthGuard } from "../../shared/jwt-auth.guard";
import { requireOrganization } from "../../shared/require-organization";
import { AssignTaskDto } from "./dto/assign-task.dto";
import { CreateTaskDto } from "./dto/create-task.dto";
import { ListTasksQueryDto } from "./dto/list-tasks-query.dto";
import { UpdateTaskStatusDto } from "./dto/update-task-status.dto";
import { UpdateTaskDto } from "./dto/update-task.dto";
import { TasksService } from "./tasks.service";

@UseGuards(JwtAuthGuard)
@Controller("tasks")
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTaskDto) {
    return this.tasksService.create(requireOrganization(user), user.sub, dto);
  }

  @Get()
  findMany(@CurrentUser() user: AuthenticatedUser, @Query() query: ListTasksQueryDto) {
    return this.tasksService.findMany(requireOrganization(user), query);
  }

  @Get(":id")
  findOne(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.tasksService.findOne(requireOrganization(user), id);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateTaskDto
  ) {
    return this.tasksService.update(requireOrganization(user), id, dto);
  }

  @Patch(":id/status")
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateTaskStatusDto
  ) {
    return this.tasksService.updateStatus(requireOrganization(user), id, dto);
  }

  @Patch(":id/assign")
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: AssignTaskDto
  ) {
    return this.tasksService.assign(requireOrganization(user), id, dto);
  }
}
