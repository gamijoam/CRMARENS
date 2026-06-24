import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "../../shared/authenticated-user";
import { CurrentUser } from "../../shared/current-user.decorator";
import { JwtAuthGuard } from "../../shared/jwt-auth.guard";
import { requireOrganization } from "../../shared/require-organization";
import { AssignLeadDto } from "./dto/assign-lead.dto";
import { CreateLeadDto } from "./dto/create-lead.dto";
import { ListLeadsQueryDto } from "./dto/list-leads-query.dto";
import { MoveLeadStageDto } from "./dto/move-lead-stage.dto";
import { UpdateLeadStatusDto } from "./dto/update-lead-status.dto";
import { LeadsService } from "./leads.service";

@UseGuards(JwtAuthGuard)
@Controller("leads")
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateLeadDto) {
    return this.leadsService.create(requireOrganization(user), user, dto);
  }

  @Get()
  findMany(@CurrentUser() user: AuthenticatedUser, @Query() query: ListLeadsQueryDto) {
    return this.leadsService.findMany(requireOrganization(user), user, query);
  }

  @Get(":id")
  findOne(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.leadsService.findOne(requireOrganization(user), user, id);
  }

  @Patch(":id/stage")
  moveStage(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: MoveLeadStageDto
  ) {
    return this.leadsService.moveStage(requireOrganization(user), user, id, dto);
  }

  @Patch(":id/status")
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateLeadStatusDto
  ) {
    return this.leadsService.updateStatus(requireOrganization(user), user, id, dto);
  }

  @Patch(":id/assign")
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: AssignLeadDto
  ) {
    return this.leadsService.assign(requireOrganization(user), user, id, dto);
  }
}
