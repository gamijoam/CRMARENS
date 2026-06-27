import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "../../shared/authenticated-user";
import { CurrentUser } from "../../shared/current-user.decorator";
import { JwtAuthGuard } from "../../shared/jwt-auth.guard";
import { requireOrganization } from "../../shared/require-organization";
import { requireRole } from "../../shared/require-role";
import { ChannelConnectionsService } from "./channel-connections.service";
import { CreateChannelConnectionDto } from "./dto/create-channel-connection.dto";
import { UpdateChannelConnectionConfigDto } from "./dto/update-channel-connection-config.dto";
import { UpdateChannelConnectionStatusDto } from "./dto/update-channel-connection-status.dto";

@UseGuards(JwtAuthGuard)
@Controller("channel-connections")
export class ChannelConnectionsController {
  constructor(private readonly channelConnectionsService: ChannelConnectionsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateChannelConnectionDto) {
    requireRole(user, ["owner", "admin"]);
    return this.channelConnectionsService.create(requireOrganization(user), user.sub, dto);
  }

  @Get()
  findMany(@CurrentUser() user: AuthenticatedUser) {
    return this.channelConnectionsService.findMany(requireOrganization(user));
  }

  @Get(":id")
  findOne(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.channelConnectionsService.findOne(requireOrganization(user), id);
  }

  @Patch(":id/status")
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateChannelConnectionStatusDto
  ) {
    requireRole(user, ["owner", "admin"]);
    return this.channelConnectionsService.updateStatus(requireOrganization(user), user.sub, id, dto);
  }

  @Patch(":id/config")
  updateConfig(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateChannelConnectionConfigDto
  ) {
    requireRole(user, ["owner", "admin"]);
    return this.channelConnectionsService.updateConfig(requireOrganization(user), user.sub, id, dto);
  }

  @Post(":id/test")
  testConnection(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    requireRole(user, ["owner", "admin"]);
    return this.channelConnectionsService.testConnection(requireOrganization(user), user.sub, id);
  }
}
