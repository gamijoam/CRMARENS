import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "../../shared/authenticated-user";
import { CurrentUser } from "../../shared/current-user.decorator";
import { JwtAuthGuard } from "../../shared/jwt-auth.guard";
import { requireOrganization } from "../../shared/require-organization";
import { ReportSummaryQueryDto } from "./dto/report-summary-query.dto";
import { ReportsService } from "./reports.service";

@UseGuards(JwtAuthGuard)
@Controller("reports")
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get("summary")
  getSummary(@CurrentUser() user: AuthenticatedUser, @Query() query: ReportSummaryQueryDto) {
    return this.reportsService.getSummary(requireOrganization(user), user, query);
  }
}
