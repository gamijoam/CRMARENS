import { Module } from "@nestjs/common";
import { ChannelConnectionsController } from "./channel-connections.controller";
import { ChannelConnectionsService } from "./channel-connections.service";

@Module({
  controllers: [ChannelConnectionsController],
  providers: [ChannelConnectionsService],
  exports: [ChannelConnectionsService]
})
export class ChannelConnectionsModule {}
