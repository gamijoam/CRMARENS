import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "../../shared/authenticated-user";
import { CurrentUser } from "../../shared/current-user.decorator";
import { JwtAuthGuard } from "../../shared/jwt-auth.guard";
import { requireOrganization } from "../../shared/require-organization";
import { AssignConversationDto } from "./dto/assign-conversation.dto";
import { CreateConversationDto } from "./dto/create-conversation.dto";
import { ListConversationsQueryDto } from "./dto/list-conversations-query.dto";
import { ConversationsService } from "./conversations.service";

@UseGuards(JwtAuthGuard)
@Controller("conversations")
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateConversationDto) {
    return this.conversationsService.create(requireOrganization(user), user, dto);
  }

  @Get()
  findMany(@CurrentUser() user: AuthenticatedUser, @Query() query: ListConversationsQueryDto) {
    return this.conversationsService.findMany(requireOrganization(user), user, query);
  }

  @Get(":id")
  findOne(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.conversationsService.findOne(requireOrganization(user), user, id);
  }

  @Patch(":id/assign")
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: AssignConversationDto
  ) {
    return this.conversationsService.assign(requireOrganization(user), user, id, dto);
  }

  @Patch(":id/close")
  close(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.conversationsService.close(requireOrganization(user), user, id);
  }
}
