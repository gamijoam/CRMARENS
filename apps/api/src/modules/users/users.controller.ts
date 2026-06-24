import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "../../shared/authenticated-user";
import { CurrentUser } from "../../shared/current-user.decorator";
import { JwtAuthGuard } from "../../shared/jwt-auth.guard";
import { requireOrganization } from "../../shared/require-organization";
import { requireRole } from "../../shared/require-role";
import { CreateUserDto } from "./dto/create-user.dto";
import { UsersService } from "./users.service";

@UseGuards(JwtAuthGuard)
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateUserDto) {
    requireRole(user, ["owner", "admin"]);
    return this.usersService.create(requireOrganization(user), dto);
  }

  @Get()
  findMany(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findMany(requireOrganization(user));
  }

  @Get(":id")
  findOne(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.usersService.findOne(requireOrganization(user), id);
  }
}
