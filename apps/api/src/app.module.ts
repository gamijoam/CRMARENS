import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuditLogsModule } from "./modules/audit-logs/audit-logs.module";
import { AssignmentsModule } from "./modules/assignments/assignments.module";
import { AuthModule } from "./modules/auth/auth.module";
import { ChannelConnectionsModule } from "./modules/channel-connections/channel-connections.module";
import { ContactsModule } from "./modules/contacts/contacts.module";
import { ConversationsModule } from "./modules/conversations/conversations.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { LeadsModule } from "./modules/leads/leads.module";
import { MessagesModule } from "./modules/messages/messages.module";
import { NotesModule } from "./modules/notes/notes.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { OrganizationsModule } from "./modules/organizations/organizations.module";
import { PipelinesModule } from "./modules/pipelines/pipelines.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { RealtimeModule } from "./modules/realtime/realtime.module";
import { SearchModule } from "./modules/search/search.module";
import { TasksModule } from "./modules/tasks/tasks.module";
import { UsersModule } from "./modules/users/users.module";
import { WebhooksModule } from "./modules/webhooks/webhooks.module";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuditLogsModule,
    AssignmentsModule,
    AuthModule,
    OrganizationsModule,
    UsersModule,
    ChannelConnectionsModule,
    ContactsModule,
    PipelinesModule,
    LeadsModule,
    NotesModule,
    TasksModule,
    ConversationsModule,
    MessagesModule,
    DashboardModule,
    NotificationsModule,
    ReportsModule,
    RealtimeModule,
    SearchModule,
    WebhooksModule
  ]
})
export class AppModule {}
