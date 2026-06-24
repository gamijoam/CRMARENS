import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "../../shared/authenticated-user";
import { CurrentUser } from "../../shared/current-user.decorator";
import { JwtAuthGuard } from "../../shared/jwt-auth.guard";
import { requireOrganization } from "../../shared/require-organization";
import { CreatePipelineDto } from "./dto/create-pipeline.dto";
import { ReorderPipelineStagesDto } from "./dto/reorder-pipeline-stages.dto";
import { PipelinesService } from "./pipelines.service";

@UseGuards(JwtAuthGuard)
@Controller("pipelines")
export class PipelinesController {
  constructor(private readonly pipelinesService: PipelinesService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePipelineDto) {
    return this.pipelinesService.create(requireOrganization(user), dto);
  }

  @Get()
  findMany(@CurrentUser() user: AuthenticatedUser) {
    return this.pipelinesService.findMany(requireOrganization(user));
  }

  @Get(":id")
  findOne(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.pipelinesService.findOne(requireOrganization(user), id);
  }

  @Patch(":id/stages/reorder")
  reorderStages(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: ReorderPipelineStagesDto
  ) {
    return this.pipelinesService.reorderStages(requireOrganization(user), id, dto);
  }
}
