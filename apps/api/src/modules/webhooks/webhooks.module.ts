import { Module } from "@nestjs/common";
import { AuditLogsModule } from "../audit-logs/audit-logs.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { WebhooksController } from "./webhooks.controller";
import { WebhooksService } from "./webhooks.service";

@Module({
  imports: [AuditLogsModule, RealtimeModule],
  controllers: [WebhooksController],
  providers: [WebhooksService]
})
export class WebhooksModule {}
