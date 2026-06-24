import { Module } from "@nestjs/common";
import { AuditLogsModule } from "../audit-logs/audit-logs.module";
import { MessagesController } from "./messages.controller";
import { MessagesService } from "./messages.service";
import { WhatsappCloudService } from "./whatsapp-cloud.service";

@Module({
  imports: [AuditLogsModule],
  controllers: [MessagesController],
  providers: [MessagesService, WhatsappCloudService],
  exports: [MessagesService]
})
export class MessagesModule {}
