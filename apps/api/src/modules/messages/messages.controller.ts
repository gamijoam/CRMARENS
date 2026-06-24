import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "../../shared/authenticated-user";
import { CurrentUser } from "../../shared/current-user.decorator";
import { JwtAuthGuard } from "../../shared/jwt-auth.guard";
import { requireOrganization } from "../../shared/require-organization";
import { CreateMessageDto } from "./dto/create-message.dto";
import { UpdateMessageStatusDto } from "./dto/update-message-status.dto";
import { MessagesService } from "./messages.service";

@UseGuards(JwtAuthGuard)
@Controller("conversations/:conversationId/messages")
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("conversationId") conversationId: string,
    @Body() dto: CreateMessageDto
  ) {
    return this.messagesService.create(requireOrganization(user), user, conversationId, dto);
  }

  @Get()
  findMany(@CurrentUser() user: AuthenticatedUser, @Param("conversationId") conversationId: string) {
    return this.messagesService.findMany(requireOrganization(user), user, conversationId);
  }

  @Patch(":messageId/status")
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param("conversationId") conversationId: string,
    @Param("messageId") messageId: string,
    @Body() dto: UpdateMessageStatusDto
  ) {
    return this.messagesService.updateStatus(
      requireOrganization(user),
      user,
      conversationId,
      messageId,
      dto
    );
  }
}
