import { Module } from "@nestjs/common";
import { AuditLogsModule } from "../audit-logs/audit-logs.module";
import { ChannelConnectionsController } from "./channel-connections.controller";
import { ChannelConnectionsService } from "./channel-connections.service";

@Module({
  imports: [AuditLogsModule],
  controllers: [ChannelConnectionsController],
  providers: [ChannelConnectionsService],
  exports: [ChannelConnectionsService]
})
export class ChannelConnectionsModule {}
