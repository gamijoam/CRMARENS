import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { canViewTeamData, scopedAssignedUserId } from "../../shared/access-policy";
import { AuthenticatedUser } from "../../shared/authenticated-user";
import { PrismaService } from "../../prisma/prisma.service";

type NotificationPriority = "urgent" | "attention" | "info";

interface OperationalNotification {
  body: string;
  count?: number;
  entityId?: string;
  entityType: string;
  id: string;
  priority: NotificationPriority;
  targetView: string;
  title: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(organizationId: string, user: AuthenticatedUser) {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const staleThreshold = new Date(now);
    staleThreshold.setHours(staleThreshold.getHours() - 4);

    const assignedUserId = scopedAssignedUserId(user);
    const taskWhere: Prisma.TaskWhereInput = {
      organizationId,
      ...(assignedUserId ? { assignedUserId } : {})
    };
    const conversationWhere: Prisma.ConversationWhereInput = {
      organizationId,
      ...(assignedUserId ? { assignedUserId } : {})
    };
    const leadWhere: Prisma.LeadWhereInput = {
      organizationId,
      ...(assignedUserId ? { assignedUserId } : {})
    };

    const [
      overdueTasks,
      dueTodayTasks,
      staleConversations,
      unassignedConversations,
      unassignedLeads,
      recentActivity
    ] = await Promise.all([
      this.prisma.task.findMany({
        where: { ...taskWhere, status: "open", dueAt: { lt: startOfToday } },
        orderBy: { dueAt: "asc" },
        select: { id: true, title: true },
        take: 5
      }),
      this.prisma.task.count({
        where: { ...taskWhere, status: "open", dueAt: { gte: startOfToday, lte: endOfToday } }
      }),
      this.prisma.conversation.findMany({
        where: {
          ...conversationWhere,
          status: "open",
          OR: [{ lastMessageAt: { lt: staleThreshold } }, { lastMessageAt: null }]
        },
        orderBy: [{ lastMessageAt: "asc" }, { createdAt: "asc" }],
        select: { id: true, contact: { select: { fullName: true } } },
        take: 5
      }),
      canViewTeamData(user)
        ? this.prisma.conversation.count({ where: { organizationId, status: "open", assignedUserId: null } })
        : Promise.resolve(0),
      canViewTeamData(user)
        ? this.prisma.lead.count({ where: { organizationId, status: "open", assignedUserId: null } })
        : this.prisma.lead.count({ where: { ...leadWhere, status: "open" } }),
      this.prisma.auditLog.findMany({
        where: {
          organizationId,
          action: { in: ["lead.won", "lead.lost", "conversation.closed", "contacts.imported"] },
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
        select: { action: true, createdAt: true, entityId: true, entityType: true, id: true },
        take: 3
      })
    ]);

    const notifications: OperationalNotification[] = [];

    if (overdueTasks.length) {
      notifications.push({
        body: overdueTasks[0].title,
        count: overdueTasks.length,
        entityId: overdueTasks[0].id,
        entityType: "task",
        id: "tasks-overdue",
        priority: "urgent",
        targetView: "tasks",
        title: overdueTasks.length === 1 ? "Tarea vencida" : "Tareas vencidas"
      });
    }

    if (staleConversations.length) {
      notifications.push({
        body: `${staleConversations[0].contact.fullName} requiere seguimiento`,
        count: staleConversations.length,
        entityId: staleConversations[0].id,
        entityType: "conversation",
        id: "conversations-stale",
        priority: "urgent",
        targetView: "inbox",
        title: staleConversations.length === 1 ? "Chat sin respuesta reciente" : "Chats sin respuesta reciente"
      });
    }

    if (unassignedConversations > 0) {
      notifications.push({
        body: "Hay conversaciones abiertas esperando responsable",
        count: unassignedConversations,
        entityType: "conversation",
        id: "conversations-unassigned",
        priority: "attention",
        targetView: "inbox",
        title: "Chats sin asignar"
      });
    }

    if (unassignedLeads > 0 && canViewTeamData(user)) {
      notifications.push({
        body: "Revisa el pipeline y reparte propietarios",
        count: unassignedLeads,
        entityType: "lead",
        id: "leads-unassigned",
        priority: "attention",
        targetView: "leads",
        title: "Leads sin responsable"
      });
    }

    if (dueTodayTasks > 0) {
      notifications.push({
        body: "Agenda de seguimiento para hoy",
        count: dueTodayTasks,
        entityType: "task",
        id: "tasks-due-today",
        priority: "attention",
        targetView: "tasks",
        title: "Tareas vencen hoy"
      });
    }

    for (const activity of recentActivity) {
      notifications.push({
        body: this.activityBody(activity.action),
        entityId: activity.entityId ?? undefined,
        entityType: activity.entityType,
        id: `activity-${activity.id}`,
        priority: "info",
        targetView: "activity",
        title: this.activityTitle(activity.action)
      });
    }

    return notifications.slice(0, 12);
  }

  private activityTitle(action: string) {
    const labels: Record<string, string> = {
      "contacts.imported": "Importacion completada",
      "conversation.closed": "Conversacion cerrada",
      "lead.lost": "Lead perdido",
      "lead.won": "Lead ganado"
    };
    return labels[action] ?? "Actividad reciente";
  }

  private activityBody(action: string) {
    const labels: Record<string, string> = {
      "contacts.imported": "Se agregaron contactos al CRM",
      "conversation.closed": "Una conversacion paso a cerrada",
      "lead.lost": "Una oportunidad se marco como perdida",
      "lead.won": "Una oportunidad se marco como ganada"
    };
    return labels[action] ?? "Hay movimiento nuevo en el CRM";
  }
}
