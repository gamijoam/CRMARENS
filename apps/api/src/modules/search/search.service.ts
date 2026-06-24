import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { canViewTeamData, scopedAssignedUserId } from "../../shared/access-policy";
import { AuthenticatedUser } from "../../shared/authenticated-user";
import { SearchQueryDto } from "./dto/search-query.dto";

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(organizationId: string, user: AuthenticatedUser, query: SearchQueryDto) {
    const q = query.q.trim();
    const textMatch = { contains: q, mode: "insensitive" } satisfies Prisma.StringFilter;
    const scopedAssignee = scopedAssignedUserId(user, query.assignedUserId);
    const [contacts, leads, tasks, notes, conversations] = await Promise.all([
      this.prisma.contact.findMany({
        where: {
          organizationId,
          OR: [
            { fullName: textMatch },
            { phone: textMatch },
            { email: textMatch },
            { tags: { has: q } }
          ]
        },
        orderBy: { updatedAt: "desc" },
        take: 8
      }),
      this.prisma.lead.findMany({
        where: {
          organizationId,
          status: query.status,
          assignedUserId: scopedAssignee,
          OR: [
            { contact: { fullName: textMatch } },
            { contact: { email: textMatch } },
            { contact: { phone: textMatch } },
            { pipeline: { name: textMatch } },
            { stage: { name: textMatch } }
          ]
        },
        include: {
          contact: true,
          pipeline: true,
          stage: true,
          assignee: { select: { id: true, name: true, email: true } }
        },
        orderBy: { updatedAt: "desc" },
        take: 8
      }),
      this.prisma.task.findMany({
        where: {
          organizationId,
          status: query.status,
          assignedUserId: scopedAssignee,
          OR: [
            { title: textMatch },
            { description: textMatch },
            { contact: { fullName: textMatch } },
            { lead: { contact: { fullName: textMatch } } }
          ]
        },
        include: {
          contact: true,
          lead: { include: { pipeline: true, stage: true } },
          assignee: { select: { id: true, name: true, email: true } }
        },
        orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }],
        take: 8
      }),
      this.prisma.note.findMany({
        where: {
          organizationId,
          AND: [
            canViewTeamData(user)
              ? {}
              : {
                  OR: [
                    { createdByUserId: user.sub },
                    { lead: { assignedUserId: user.sub } }
                  ]
                },
            {
              OR: [
                { body: textMatch },
                { contact: { fullName: textMatch } },
                { lead: { contact: { fullName: textMatch } } }
              ]
            }
          ]
        },
        include: {
          contact: true,
          lead: { include: { pipeline: true, stage: true } }
        },
        orderBy: { updatedAt: "desc" },
        take: 8
      }),
      this.prisma.conversation.findMany({
        where: {
          organizationId,
          status: query.status,
          assignedUserId: scopedAssignee,
          channel: query.channel,
          OR: [
            { contact: { fullName: textMatch } },
            { contact: { email: textMatch } },
            { contact: { phone: textMatch } },
            { messages: { some: { text: textMatch } } },
            { channelConnection: { name: textMatch } }
          ]
        },
        include: {
          contact: true,
          channelConnection: { select: { id: true, name: true, channel: true, status: true } },
          assignee: { select: { id: true, name: true, email: true } },
          messages: { orderBy: { createdAt: "desc" }, take: 1 }
        },
        orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
        take: 8
      })
    ]);

    return {
      contacts,
      leads,
      tasks,
      notes,
      conversations,
      total: contacts.length + leads.length + tasks.length + notes.length + conversations.length
    };
  }
}
