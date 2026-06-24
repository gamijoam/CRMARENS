import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { canViewTeamData, scopedAssignedUserId } from "../../shared/access-policy";
import { AuthenticatedUser } from "../../shared/authenticated-user";
import { getConversationSlaState, SLA_BREACH_HOURS, SLA_WARNING_HOURS } from "../../shared/sla-policy";

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getMetrics(organizationId: string, user: AuthenticatedUser) {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const lastSevenDays = new Date(now);
    lastSevenDays.setDate(lastSevenDays.getDate() - 7);

    const assignedUserId = scopedAssignedUserId(user);
    const leadWhere: Prisma.LeadWhereInput = {
      organizationId,
      ...(assignedUserId ? { assignedUserId } : {})
    };
    const taskWhere: Prisma.TaskWhereInput = {
      organizationId,
      ...(assignedUserId ? { assignedUserId } : {})
    };
    const conversationWhere: Prisma.ConversationWhereInput = {
      organizationId,
      ...(assignedUserId ? { assignedUserId } : {})
    };

    const [
      totalContacts,
      totalLeads,
      openLeads,
      wonLeads,
      lostLeads,
      openTasks,
      overdueTasks,
      dueTodayTasks,
      openConversations,
      unassignedConversations,
      activeConnections,
      teamMembers,
      openLeadRows,
      openConversationRows,
      recentTasks,
      recentActivity,
      activeUsers
    ] = await Promise.all([
      this.prisma.contact.count({ where: { organizationId } }),
      this.prisma.lead.count({ where: leadWhere }),
      this.prisma.lead.count({ where: { ...leadWhere, status: "open" } }),
      this.prisma.lead.count({ where: { ...leadWhere, status: "won" } }),
      this.prisma.lead.count({ where: { ...leadWhere, status: "lost" } }),
      this.prisma.task.count({ where: { ...taskWhere, status: "open" } }),
      this.prisma.task.count({ where: { ...taskWhere, status: "open", dueAt: { lt: startOfToday } } }),
      this.prisma.task.count({
        where: { ...taskWhere, status: "open", dueAt: { gte: startOfToday, lte: endOfToday } }
      }),
      this.prisma.conversation.count({ where: { ...conversationWhere, status: "open" } }),
      this.prisma.conversation.count({ where: { organizationId, status: "open", assignedUserId: null } }),
      this.prisma.channelConnection.count({ where: { organizationId, status: "active" } }),
      this.prisma.organizationUser.count({ where: { organizationId, isActive: true } }),
      this.prisma.lead.findMany({
        where: { ...leadWhere, status: "open" },
        select: {
          id: true,
          value: true,
          stage: { select: { id: true, name: true, position: true } }
        },
        take: 500
      }),
      this.prisma.conversation.findMany({
        where: { ...conversationWhere, status: "open" },
        select: { channel: true, createdAt: true, lastMessageAt: true },
        take: 500
      }),
      this.prisma.task.findMany({
        where: { ...taskWhere, status: "open" },
        include: {
          assignee: { select: { id: true, name: true, email: true } },
          contact: { select: { id: true, fullName: true } },
          lead: { select: { id: true } }
        },
        orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
        take: 6
      }),
      this.prisma.auditLog.findMany({
        where: {
          organizationId,
          createdAt: { gte: lastSevenDays },
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
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          action: true,
          actorUserId: true,
          createdAt: true,
          entityType: true
        },
        take: 8
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
        select: {
          id: true,
          name: true,
          email: true,
          _count: {
            select: {
              assignedConversations: { where: { organizationId, status: "open" } },
              assignedLeads: { where: { organizationId, status: "open" } },
              assignedTasks: { where: { organizationId, status: "open" } }
            }
          }
        },
        orderBy: { name: "asc" }
      })
    ]);

    const pipelineByStage = Array.from(
      openLeadRows.reduce((accumulator, lead) => {
        const current = accumulator.get(lead.stage.id) ?? {
          count: 0,
          stageId: lead.stage.id,
          stageName: lead.stage.name,
          stagePosition: lead.stage.position,
          value: 0
        };
        current.count += 1;
        current.value += Number(lead.value ?? 0);
        accumulator.set(lead.stage.id, current);
        return accumulator;
      }, new Map<string, { count: number; stageId: string; stageName: string; stagePosition: number; value: number }>())
    )
      .map(([, value]) => value)
      .sort((left, right) => left.stagePosition - right.stagePosition);

    const conversationsByChannel = Array.from(
      openConversationRows.reduce((accumulator, conversation) => {
        accumulator.set(conversation.channel, (accumulator.get(conversation.channel) ?? 0) + 1);
        return accumulator;
      }, new Map<string, number>())
    ).map(([channel, count]) => ({ channel, count }));
    const slaSummary = openConversationRows.reduce(
      (summary, conversation) => {
        const state = getConversationSlaState(conversation.lastMessageAt ?? conversation.createdAt, now);
        summary[state] += 1;
        return summary;
      },
      { breached: 0, ok: 0, warning: 0 }
    );

    return {
      summary: {
        activeConnections,
        contacts: totalContacts,
        dueTodayTasks,
        leads: totalLeads,
        lostLeads,
        openConversations,
        openLeads,
        openTasks,
        overdueTasks,
        slaBreachedConversations: slaSummary.breached,
        slaOkConversations: slaSummary.ok,
        slaWarningConversations: slaSummary.warning,
        teamMembers,
        unassignedConversations,
        wonLeads,
        slaRules: {
          breachHours: SLA_BREACH_HOURS,
          warningHours: SLA_WARNING_HOURS
        }
      },
      pipelineByStage,
      conversationsByChannel,
      recentTasks: recentTasks.map((task) => ({
        id: task.id,
        title: task.title,
        dueAt: task.dueAt,
        assignee: task.assignee,
        contact: task.contact,
        leadId: task.leadId
      })),
      recentActivity,
      workload: activeUsers.map((member) => ({
        id: member.id,
        name: member.name,
        email: member.email,
        openConversations: member._count.assignedConversations,
        openLeads: member._count.assignedLeads,
        openTasks: member._count.assignedTasks
      }))
    };
  }

}
