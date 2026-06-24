import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { canViewTeamData, scopedAssignedUserId } from "../../shared/access-policy";
import { AuthenticatedUser } from "../../shared/authenticated-user";
import { getConversationSlaState } from "../../shared/sla-policy";
import { ReportSummaryQueryDto } from "./dto/report-summary-query.dto";

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(organizationId: string, user: AuthenticatedUser, query: ReportSummaryQueryDto) {
    const days = query.days ?? 30;
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - days);

    const assignedUserId = scopedAssignedUserId(user);
    const leadWhere: Prisma.LeadWhereInput = {
      organizationId,
      createdAt: { gte: from },
      ...(assignedUserId ? { assignedUserId } : {})
    };
    const taskWhere: Prisma.TaskWhereInput = {
      organizationId,
      createdAt: { gte: from },
      ...(assignedUserId ? { assignedUserId } : {})
    };
    const conversationWhere: Prisma.ConversationWhereInput = {
      organizationId,
      createdAt: { gte: from },
      ...(assignedUserId ? { assignedUserId } : {})
    };

    const [
      leads,
      tasks,
      conversations,
      auditLogs,
      users
    ] = await Promise.all([
      this.prisma.lead.findMany({
        where: leadWhere,
        select: { assignedUserId: true, createdAt: true, currency: true, status: true, value: true },
        take: 1000
      }),
      this.prisma.task.findMany({
        where: taskWhere,
        select: { assignedUserId: true, dueAt: true, status: true },
        take: 1000
      }),
      this.prisma.conversation.findMany({
        where: conversationWhere,
        select: { assignedUserId: true, channel: true, createdAt: true, lastMessageAt: true, status: true },
        take: 1000
      }),
      this.prisma.auditLog.findMany({
        where: {
          organizationId,
          createdAt: { gte: from },
          ...(canViewTeamData(user)
            ? {}
            : {
                OR: [
                  { actorUserId: user.sub },
                  { metadata: { path: ["assignedUserId"], equals: user.sub } },
                  { metadata: { path: ["createdByUserId"], equals: user.sub } }
                ]
              })
        },
        select: { action: true, actorUserId: true, createdAt: true, entityType: true },
        take: 1000
      }),
      this.prisma.user.findMany({
        where: {
          organizations: {
            some: {
              organizationId,
              isActive: true,
              ...(canViewTeamData(user) ? {} : { userId: user.sub })
            }
          }
        },
        select: { email: true, id: true, name: true },
        orderBy: { name: "asc" }
      })
    ]);

    const sla = conversations.reduce(
      (summary, conversation) => {
        if (conversation.status !== "open") {
          return summary;
        }
        const state = getConversationSlaState(conversation.lastMessageAt ?? conversation.createdAt, now);
        summary[state] += 1;
        return summary;
      },
      { breached: 0, ok: 0, warning: 0 }
    );

    const userNames = new Map(users.map((member) => [member.id, member.name]));
    const activityByUser = users.map((member) => {
      const userLogs = auditLogs.filter((log) => log.actorUserId === member.id);
      return {
        activity: userLogs.length,
        closedConversations: userLogs.filter((log) => log.action === "conversation.closed").length,
        id: member.id,
        leadsWon: userLogs.filter((log) => log.action === "lead.won").length,
        name: member.name
      };
    });

    const conversationsByChannel = Array.from(
      conversations.reduce((accumulator, conversation) => {
        accumulator.set(conversation.channel, (accumulator.get(conversation.channel) ?? 0) + 1);
        return accumulator;
      }, new Map<string, number>())
    ).map(([channel, count]) => ({ channel, count }));

    return {
      period: {
        days,
        from,
        to: now
      },
      summary: {
        activities: auditLogs.length,
        chatsBreachedSla: sla.breached,
        chatsClosed: conversations.filter((conversation) => conversation.status === "closed").length,
        chatsOpened: conversations.length,
        chatsWarningSla: sla.warning,
        leadsCreated: leads.length,
        leadsLost: leads.filter((lead) => lead.status === "lost").length,
        leadsOpen: leads.filter((lead) => lead.status === "open").length,
        leadsValue: leads.reduce((total, lead) => total + Number(lead.value ?? 0), 0),
        leadsWon: leads.filter((lead) => lead.status === "won").length,
        tasksCompleted: tasks.filter((task) => task.status === "done").length,
        tasksCreated: tasks.length,
        tasksOverdue: tasks.filter((task) => task.status === "open" && task.dueAt && task.dueAt < now).length
      },
      conversationsByChannel,
      activityByUser,
      activityByType: this.countBy(auditLogs, (log) => log.entityType),
      leadsByStatus: this.countBy(leads, (lead) => lead.status),
      topAssignees: users.map((member) => ({
        id: member.id,
        name: userNames.get(member.id) ?? member.name,
        conversations: conversations.filter((conversation) => conversation.assignedUserId === member.id).length,
        leads: leads.filter((lead) => lead.assignedUserId === member.id).length,
        tasks: tasks.filter((task) => task.assignedUserId === member.id).length
      }))
    };
  }

  private countBy<T>(items: T[], getKey: (item: T) => string) {
    return Array.from(
      items.reduce((accumulator, item) => {
        const key = getKey(item);
        accumulator.set(key, (accumulator.get(key) ?? 0) + 1);
        return accumulator;
      }, new Map<string, number>())
    ).map(([name, count]) => ({ count, name }));
  }
}
