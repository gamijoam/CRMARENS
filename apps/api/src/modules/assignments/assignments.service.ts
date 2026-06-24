import { ForbiddenException, Injectable } from "@nestjs/common";
import { OrganizationRole } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { canViewTeamData } from "../../shared/access-policy";
import { AuthenticatedUser } from "../../shared/authenticated-user";
import { AuditLogsService } from "../audit-logs/audit-logs.service";

interface AssignmentTarget {
  currentLoad: number;
  email: string;
  id: string;
  name: string;
}

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService
  ) {}

  async autoAssignLeads(organizationId: string, user: AuthenticatedUser) {
    this.ensureCanAutoAssign(user);

    const [targets, leads] = await Promise.all([
      this.getTargets(organizationId, "leads"),
      this.prisma.lead.findMany({
        where: { organizationId, status: "open", assignedUserId: null },
        orderBy: { createdAt: "asc" },
        select: { id: true },
        take: 100
      })
    ]);

    const assignments = await this.assignRecords(leads.map((lead) => lead.id), targets, async (id, assignedUserId) => {
      await this.prisma.lead.update({
        where: { id },
        data: { assignedUserId }
      });
    });

    await this.logAutoAssignment(organizationId, user.sub, "leads.auto_assigned", "lead", assignments);

    return this.toResult(assignments, leads.length, targets.length);
  }

  async autoAssignConversations(organizationId: string, user: AuthenticatedUser) {
    this.ensureCanAutoAssign(user);

    const [targets, conversations] = await Promise.all([
      this.getTargets(organizationId, "conversations"),
      this.prisma.conversation.findMany({
        where: { organizationId, status: "open", assignedUserId: null },
        orderBy: [{ lastMessageAt: "asc" }, { createdAt: "asc" }],
        select: { id: true },
        take: 100
      })
    ]);

    const assignments = await this.assignRecords(
      conversations.map((conversation) => conversation.id),
      targets,
      async (id, assignedUserId) => {
        await this.prisma.conversation.update({
          where: { id },
          data: { assignedUserId }
        });
      }
    );

    await this.logAutoAssignment(
      organizationId,
      user.sub,
      "conversations.auto_assigned",
      "conversation",
      assignments
    );

    return this.toResult(assignments, conversations.length, targets.length);
  }

  private ensureCanAutoAssign(user: AuthenticatedUser) {
    if (!canViewTeamData(user)) {
      throw new ForbiddenException("Only team managers can auto assign records");
    }
  }

  private async getTargets(organizationId: string, workload: "conversations" | "leads") {
    const members = await this.prisma.organizationUser.findMany({
      where: {
        organizationId,
        isActive: true,
        role: { in: [OrganizationRole.seller, OrganizationRole.supervisor] }
      },
      select: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            _count: {
              select: {
                assignedConversations: { where: { organizationId, status: "open" } },
                assignedLeads: { where: { organizationId, status: "open" } }
              }
            }
          }
        }
      },
      orderBy: { createdAt: "asc" }
    });

    return members.map(({ user }) => ({
      currentLoad: workload === "leads" ? user._count.assignedLeads : user._count.assignedConversations,
      email: user.email,
      id: user.id,
      name: user.name
    }));
  }

  private async assignRecords(
    recordIds: string[],
    targets: AssignmentTarget[],
    updateRecord: (id: string, assignedUserId: string) => Promise<void>
  ) {
    if (!recordIds.length || !targets.length) {
      return [];
    }

    const assignments: Array<{ assignedUserId: string; recordId: string }> = [];

    for (const recordId of recordIds) {
      const target = targets.sort((left, right) => left.currentLoad - right.currentLoad || left.name.localeCompare(right.name))[0];
      await updateRecord(recordId, target.id);
      target.currentLoad += 1;
      assignments.push({ assignedUserId: target.id, recordId });
    }

    return assignments;
  }

  private async logAutoAssignment(
    organizationId: string,
    actorUserId: string,
    action: string,
    entityType: string,
    assignments: Array<{ assignedUserId: string; recordId: string }>
  ) {
    if (!assignments.length) {
      return;
    }

    await this.auditLogs.create({
      action,
      actorUserId,
      entityType,
      metadata: {
        assignedCount: assignments.length,
        assignedUserIds: [...new Set(assignments.map((assignment) => assignment.assignedUserId))],
        recordIds: assignments.map((assignment) => assignment.recordId)
      },
      organizationId
    });
  }

  private toResult(
    assignments: Array<{ assignedUserId: string; recordId: string }>,
    pending: number,
    targets: number
  ) {
    return {
      assigned: assignments.length,
      pending,
      skipped: Math.max(pending - assignments.length, 0),
      targets
    };
  }
}
