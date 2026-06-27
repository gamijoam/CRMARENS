import { Module } from "@nestjs/common";
import { AuditLogsModule } from "../audit-logs/audit-logs.module";
import { InstagramCloudService } from "./instagram-cloud.service";
import { MessengerCloudService } from "./messenger-cloud.service";
import { MessagesController } from "./messages.controller";
import { MessagesService } from "./messages.service";
import { WhatsappCloudService } from "./whatsapp-cloud.service";

@Module({
  imports: [AuditLogsModule],
  controllers: [MessagesController],
  providers: [InstagramCloudService, MessagesService, MessengerCloudService, WhatsappCloudService],
  exports: [MessagesService]
})
export class MessagesModule {}
