import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "../../shared/authenticated-user";
import { CurrentUser } from "../../shared/current-user.decorator";
import { JwtAuthGuard } from "../../shared/jwt-auth.guard";
import { requireOrganization } from "../../shared/require-organization";
import { SearchQueryDto } from "./dto/search-query.dto";
import { SearchService } from "./search.service";

@UseGuards(JwtAuthGuard)
@Controller("search")
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  search(@CurrentUser() user: AuthenticatedUser, @Query() query: SearchQueryDto) {
    return this.searchService.search(requireOrganization(user), query);
  }
}
