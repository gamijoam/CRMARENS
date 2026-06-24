import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { canViewTeamData, ensureCanAssignTo, scopedAssignedUserId } from "../../shared/access-policy";
import { AuthenticatedUser } from "../../shared/authenticated-user";
import { AssignConversationDto } from "./dto/assign-conversation.dto";
import { CreateConversationDto } from "./dto/create-conversation.dto";
import { ListConversationsQueryDto } from "./dto/list-conversations-query.dto";

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, user: AuthenticatedUser, dto: CreateConversationDto) {
    await this.ensureContactExists(organizationId, dto.contactId);
    ensureCanAssignTo(user, dto.assignedUserId);
    if (dto.channelConnectionId) {
      await this.ensureChannelConnectionExists(organizationId, dto.channelConnectionId, dto.channel);
    }
    if (dto.assignedUserId) {
      await this.ensureOrganizationUserExists(organizationId, dto.assignedUserId);
    }

    const assignedUserId = dto.assignedUserId ?? (!canViewTeamData(user) ? user.sub : undefined);

    return this.prisma.conversation.create({
      data: {
        organizationId,
        contactId: dto.contactId,
        channel: dto.channel,
        channelConnectionId: dto.channelConnectionId,
        assignedUserId
      },
      include: this.conversationInclude()
    });
  }

  findMany(organizationId: string, user: AuthenticatedUser, query: ListConversationsQueryDto) {
    const where: Prisma.ConversationWhereInput = {
      organizationId,
      status: query.status,
      assignedUserId: scopedAssignedUserId(user, query.assignedUserId),
      contactId: query.contactId,
      channel: query.channel
    };

    return this.prisma.conversation.findMany({
      where,
      include: {
        ...this.conversationInclude(),
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1
        }
      },
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      take: 100
    });
  }

  async findOne(organizationId: string, user: AuthenticatedUser, id: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id,
        organizationId,
        ...(canViewTeamData(user) ? {} : { assignedUserId: user.sub })
      },
      include: {
        ...this.conversationInclude(),
        messages: {
          include: {
            sentBy: {
              select: { id: true, name: true, email: true }
            }
          },
          orderBy: { createdAt: "asc" }
        }
      }
    });

    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    return conversation;
  }

  async assign(organizationId: string, user: AuthenticatedUser, id: string, dto: AssignConversationDto) {
    await this.findOne(organizationId, user, id);
    ensureCanAssignTo(user, dto.assignedUserId);
    if (dto.assignedUserId) {
      await this.ensureOrganizationUserExists(organizationId, dto.assignedUserId);
    }

    return this.prisma.conversation.update({
      where: { id },
      data: { assignedUserId: dto.assignedUserId ?? null },
      include: this.conversationInclude()
    });
  }

  async close(organizationId: string, user: AuthenticatedUser, id: string) {
    await this.findOne(organizationId, user, id);

    return this.prisma.conversation.update({
      where: { id },
      data: { status: "closed" },
      include: this.conversationInclude()
    });
  }

  private conversationInclude() {
    return {
      contact: {
        include: { channels: true }
      },
      assignee: {
        select: {
          id: true,
          name: true,
          email: true
        }
      },
      channelConnection: {
        select: {
          id: true,
          channel: true,
          name: true,
          status: true
        }
      }
    } satisfies Prisma.ConversationInclude;
  }

  private async ensureContactExists(organizationId: string, contactId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, organizationId },
      select: { id: true }
    });

    if (!contact) {
      throw new NotFoundException("Contact not found");
    }

    return contact;
  }

  private async ensureOrganizationUserExists(organizationId: string, userId: string) {
    const organizationUser = await this.prisma.organizationUser.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId
        }
      },
      select: { userId: true }
    });

    if (!organizationUser) {
      throw new NotFoundException("Assigned user not found");
    }

    return organizationUser;
  }

  private async ensureChannelConnectionExists(organizationId: string, id: string, channel: string) {
    const connection = await this.prisma.channelConnection.findFirst({
      where: {
        id,
        organizationId,
        channel,
        status: "active"
      },
      select: { id: true }
    });

    if (!connection) {
      throw new NotFoundException("Channel connection not found");
    }

    return connection;
  }
}
