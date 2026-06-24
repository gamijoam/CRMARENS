import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../shared/jwt-auth.guard";
import { CreateOrganizationDto } from "./dto/create-organization.dto";
import { OrganizationsService } from "./organizations.service";

@UseGuards(JwtAuthGuard)
@Controller("organizations")
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  create(@Body() dto: CreateOrganizationDto) {
    return this.organizationsService.create(dto);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.organizationsService.findOne(id);
  }

  @Get(":id/users")
  users(@Param("id") id: string) {
    return this.organizationsService.users(id);
  }
}
