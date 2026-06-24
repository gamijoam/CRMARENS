import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { AuthenticatedUser } from "../../shared/authenticated-user";
import { CurrentUser } from "../../shared/current-user.decorator";
import { JwtAuthGuard } from "../../shared/jwt-auth.guard";
import { requireOrganization } from "../../shared/require-organization";
import { requireRole } from "../../shared/require-role";
import { ContactsService } from "./contacts.service";
import { CreateContactDto } from "./dto/create-contact.dto";
import { ImportContactsDto } from "./dto/import-contacts.dto";
import { ListContactsQueryDto } from "./dto/list-contacts-query.dto";
import { UpdateContactDto } from "./dto/update-contact.dto";

@UseGuards(JwtAuthGuard)
@Controller("contacts")
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateContactDto) {
    return this.contactsService.create(requireOrganization(user), dto);
  }

  @Get()
  findMany(@CurrentUser() user: AuthenticatedUser, @Query() query: ListContactsQueryDto) {
    return this.contactsService.findMany(requireOrganization(user), query);
  }

  @Post("import")
  importMany(@CurrentUser() user: AuthenticatedUser, @Body() dto: ImportContactsDto) {
    requireRole(user, ["owner", "admin", "supervisor"]);
    return this.contactsService.importMany(requireOrganization(user), dto);
  }

  @Get(":id")
  findOne(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.contactsService.findOne(requireOrganization(user), id);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateContactDto
  ) {
    return this.contactsService.update(requireOrganization(user), id, dto);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.contactsService.remove(requireOrganization(user), id);
  }
}
