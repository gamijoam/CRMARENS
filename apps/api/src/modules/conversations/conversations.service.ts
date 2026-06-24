import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AssignConversationDto } from "./dto/assign-conversation.dto";
import { CreateConversationDto } from "./dto/create-conversation.dto";
import { ListConversationsQueryDto } from "./dto/list-conversations-query.dto";

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, dto: CreateConversationDto) {
    await this.ensureContactExists(organizationId, dto.contactId);
    if (dto.assignedUserId) {
      await this.ensureOrganizationUserExists(organizationId, dto.assignedUserId);
    }

    return this.prisma.conversation.create({
      data: {
        organizationId,
        contactId: dto.contactId,
        channel: dto.channel,
        channelConnectionId: dto.channelConnectionId,
        assignedUserId: dto.assignedUserId
      },
      include: this.conversationInclude()
    });
  }

  findMany(organizationId: string, query: ListConversationsQueryDto) {
    const where: Prisma.ConversationWhereInput = {
      organizationId,
      status: query.status,
      assignedUserId: query.assignedUserId,
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

  async findOne(organizationId: string, id: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, organizationId },
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

  async assign(organizationId: string, id: string, dto: AssignConversationDto) {
    await this.findOne(organizationId, id);
    if (dto.assignedUserId) {
      await this.ensureOrganizationUserExists(organizationId, dto.assignedUserId);
    }

    return this.prisma.conversation.update({
      where: { id },
      data: { assignedUserId: dto.assignedUserId ?? null },
      include: this.conversationInclude()
    });
  }

  async close(organizationId: string, id: string) {
    await this.findOne(organizationId, id);

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
}
