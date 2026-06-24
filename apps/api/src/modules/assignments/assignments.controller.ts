import { Controller, Post, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "../../shared/authenticated-user";
import { CurrentUser } from "../../shared/current-user.decorator";
import { JwtAuthGuard } from "../../shared/jwt-auth.guard";
import { requireOrganization } from "../../shared/require-organization";
import { AssignmentsService } from "./assignments.service";

@UseGuards(JwtAuthGuard)
@Controller("assignments")
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  @Post("leads/auto")
  autoAssignLeads(@CurrentUser() user: AuthenticatedUser) {
    return this.assignmentsService.autoAssignLeads(requireOrganization(user), user);
  }

  @Post("conversations/auto")
  autoAssignConversations(@CurrentUser() user: AuthenticatedUser) {
    return this.assignmentsService.autoAssignConversations(requireOrganization(user), user);
  }
}
