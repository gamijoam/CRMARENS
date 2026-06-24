import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { canViewTeamData, scopedAssignedUserId } from "../../shared/access-policy";
import { AuthenticatedUser } from "../../shared/authenticated-user";
import { ListAuditLogsQueryDto } from "./dto/list-audit-logs-query.dto";

type AuditLogInput = {
  action: string;
  actorUserId?: string;
  entityId?: string;
  entityType: string;
  metadata?: Record<string, unknown>;
  organizationId: string;
};

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  create(input: AuditLogInput) {
    return this.prisma.auditLog.create({
      data: {
        action: input.action,
        actorUserId: input.actorUserId,
        entityId: input.entityId,
        entityType: input.entityType,
        metadata: input.metadata as Prisma.InputJsonValue,
        organizationId: input.organizationId
      }
    });
  }

  async findMany(organizationId: string, user: AuthenticatedUser, query: ListAuditLogsQueryDto) {
    const actorUserId = scopedAssignedUserId(user, query.actorUserId);
    const where: Prisma.AuditLogWhereInput = {
      organizationId,
      ...(query.action ? { action: query.action } : {}),
      ...(actorUserId ? { actorUserId } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(canViewTeamData(user)
        ? {}
        : {
            OR: [
              { actorUserId: user.sub },
              { metadata: { path: ["assignedUserId"], equals: user.sub } },
              { metadata: { path: ["createdByUserId"], equals: user.sub } }
            ]
          })
    };
    const logs = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100
    });

    const actorIds = [...new Set(logs.map((log) => log.actorUserId).filter(Boolean) as string[])];
    const actors = await this.prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, name: true, email: true }
    });
    const actorById = new Map(actors.map((actor) => [actor.id, actor]));

    return logs.map((log) => ({
      ...log,
      actor: log.actorUserId ? actorById.get(log.actorUserId) ?? null : null
    }));
  }
}
