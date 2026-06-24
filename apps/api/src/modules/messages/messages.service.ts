import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { canViewTeamData } from "../../shared/access-policy";
import { AuthenticatedUser } from "../../shared/authenticated-user";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { CreateMessageDto } from "./dto/create-message.dto";
import { UpdateMessageStatusDto } from "./dto/update-message-status.dto";
import { WhatsappCloudService } from "./whatsapp-cloud.service";

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
    private readonly whatsappCloud: WhatsappCloudService
  ) {}

  async create(
    organizationId: string,
    user: AuthenticatedUser,
    conversationId: string,
    dto: CreateMessageDto
  ) {
    const conversation = await this.ensureConversationExists(organizationId, user, conversationId);

    if (!dto.text && dto.type === "text") {
      throw new BadRequestException("Text message requires text");
    }

    const message = await this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          conversationId,
          direction: dto.direction,
          channel: conversation.channel,
          externalMessageId: dto.externalMessageId,
          type: dto.type ?? "text",
          text: dto.text,
          status: dto.status ?? (dto.direction === "outbound" ? "pending" : "delivered"),
          sentByUserId: dto.direction === "outbound" ? user.sub : undefined,
          rawPayload: dto.rawPayload as Prisma.InputJsonValue
        },
        include: this.messageInclude()
      });

      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: message.createdAt,
          status: "open"
        }
      });

      await this.auditLogs.create({
        action: `message.${dto.direction}`,
        actorUserId: user.sub,
        entityId: message.id,
        entityType: "message",
        metadata: {
          assignedUserId: conversation.assignedUserId,
          conversationId,
          direction: dto.direction
        },
        organizationId
      });

      return message;
    });

    if (dto.direction === "outbound" && conversation.channel === "whatsapp" && dto.text) {
      const recipient = this.getWhatsappRecipient(conversation);
      if (recipient) {
        const result = await this.whatsappCloud.sendText({
          text: dto.text,
          to: recipient
        });

        return this.prisma.message.update({
          where: { id: message.id },
          data: {
            externalMessageId: result.externalMessageId ?? message.externalMessageId,
            rawPayload: {
              ...(dto.rawPayload ?? {}),
              whatsappCloud: result.rawPayload
            } as Prisma.InputJsonValue,
            status: result.status
          },
          include: this.messageInclude()
        });
      }

      return this.prisma.message.update({
        where: { id: message.id },
        data: {
          rawPayload: {
            ...(dto.rawPayload ?? {}),
            whatsappCloud: { error: "missing_whatsapp_recipient" }
          } as Prisma.InputJsonValue,
          status: "failed"
        },
        include: this.messageInclude()
      });
    }

    return message;
  }

  async findMany(organizationId: string, user: AuthenticatedUser, conversationId: string) {
    await this.ensureConversationExists(organizationId, user, conversationId);

    return this.prisma.message.findMany({
      where: { conversationId },
      include: this.messageInclude(),
      orderBy: { createdAt: "asc" },
      take: 200
    });
  }

  async updateStatus(
    organizationId: string,
    user: AuthenticatedUser,
    conversationId: string,
    messageId: string,
    dto: UpdateMessageStatusDto
  ) {
    await this.ensureConversationExists(organizationId, user, conversationId);
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId },
      select: { id: true }
    });

    if (!message) {
      throw new NotFoundException("Message not found");
    }

    return this.prisma.message.update({
      where: { id: messageId },
      data: { status: dto.status },
      include: this.messageInclude()
    });
  }

  private messageInclude() {
    return {
      sentBy: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    } satisfies Prisma.MessageInclude;
  }

  private async ensureConversationExists(
    organizationId: string,
    user: AuthenticatedUser,
    conversationId: string
  ) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        organizationId,
        ...(canViewTeamData(user) ? {} : { assignedUserId: user.sub })
      },
      select: {
        id: true,
        assignedUserId: true,
        channel: true,
        contact: {
          select: {
            phone: true,
            channels: {
              where: { channel: "whatsapp" },
              select: { externalId: true },
              take: 1
            }
          }
        }
      }
    });

    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    return conversation;
  }

  private getWhatsappRecipient(conversation: {
    contact: { channels: Array<{ externalId: string }>; phone: string | null };
  }) {
    return conversation.contact.channels[0]?.externalId ?? conversation.contact.phone ?? undefined;
  }
}
