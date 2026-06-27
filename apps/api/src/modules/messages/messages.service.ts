import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { canViewTeamData } from "../../shared/access-policy";
import { AuthenticatedUser } from "../../shared/authenticated-user";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { CreateMessageDto } from "./dto/create-message.dto";
import { UpdateMessageStatusDto } from "./dto/update-message-status.dto";
import { InstagramCloudService } from "./instagram-cloud.service";
import { MessengerCloudService } from "./messenger-cloud.service";
import { WhatsappCloudService } from "./whatsapp-cloud.service";

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
    private readonly instagramCloud: InstagramCloudService,
    private readonly messengerCloud: MessengerCloudService,
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
      const recipient = this.getChannelRecipient(conversation, "whatsapp") ?? conversation.contact.phone ?? undefined;
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

    if (dto.direction === "outbound" && conversation.channel === "instagram" && dto.text) {
      const recipient = this.getChannelRecipient(conversation, "instagram");
      if (recipient) {
        const result = await this.instagramCloud.sendText({
          organizationId,
          text: dto.text,
          to: recipient
        });

        return this.prisma.message.update({
          where: { id: message.id },
          data: {
            externalMessageId: result.externalMessageId ?? message.externalMessageId,
            rawPayload: {
              ...(dto.rawPayload ?? {}),
              instagramCloud: result.rawPayload
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
            instagramCloud: { error: "missing_instagram_recipient" }
          } as Prisma.InputJsonValue,
          status: "failed"
        },
        include: this.messageInclude()
      });
    }

    if (dto.direction === "outbound" && conversation.channel === "messenger" && dto.text) {
      const recipient = this.getChannelRecipient(conversation, "messenger");
      if (recipient) {
        const result = await this.messengerCloud.sendText({
          organizationId,
          text: dto.text,
          to: recipient
        });

        return this.prisma.message.update({
          where: { id: message.id },
          data: {
            externalMessageId: result.externalMessageId ?? message.externalMessageId,
            rawPayload: {
              ...(dto.rawPayload ?? {}),
              messengerCloud: result.rawPayload
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
            messengerCloud: { error: "missing_messenger_recipient" }
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

  async retry(
    organizationId: string,
    user: AuthenticatedUser,
    conversationId: string,
    messageId: string
  ) {
    const conversation = await this.ensureConversationExists(organizationId, user, conversationId);
    const message = await this.prisma.message.findFirst({
      where: {
        id: messageId,
        conversationId,
        direction: "outbound",
        status: "failed",
        type: "text"
      },
      select: {
        externalMessageId: true,
        id: true,
        rawPayload: true,
        text: true
      }
    });

    if (!message) {
      throw new NotFoundException("Failed outbound message not found");
    }

    if (!message.text) {
      throw new BadRequestException("Only text messages can be retried right now");
    }

    const rawPayload = this.asPayloadRecord(message.rawPayload);
    let result:
      | { externalMessageId?: string; rawPayload: Record<string, unknown>; status: "failed" | "sent" }
      | undefined;
    let providerKey = "manualRetry";

    if (conversation.channel === "instagram") {
      const recipient = this.getChannelRecipient(conversation, "instagram");
      if (!recipient) {
        result = {
          rawPayload: { error: "missing_instagram_recipient" },
          status: "failed"
        };
      } else {
        result = await this.instagramCloud.sendText({
          organizationId,
          text: message.text,
          to: recipient
        });
      }
      providerKey = "instagramCloudRetry";
    }

    if (conversation.channel === "whatsapp") {
      const recipient = this.getChannelRecipient(conversation, "whatsapp") ?? conversation.contact.phone ?? undefined;
      if (!recipient) {
        result = {
          rawPayload: { error: "missing_whatsapp_recipient" },
          status: "failed"
        };
      } else {
        result = await this.whatsappCloud.sendText({
          text: message.text,
          to: recipient
        });
      }
      providerKey = "whatsappCloudRetry";
    }

    if (conversation.channel === "messenger") {
      const recipient = this.getChannelRecipient(conversation, "messenger");
      if (!recipient) {
        result = {
          rawPayload: { error: "missing_messenger_recipient" },
          status: "failed"
        };
      } else {
        result = await this.messengerCloud.sendText({
          organizationId,
          text: message.text,
          to: recipient
        });
      }
      providerKey = "messengerCloudRetry";
    }

    if (!result) {
      throw new BadRequestException("This channel does not support retries yet");
    }

    const updated = await this.prisma.message.update({
      where: { id: message.id },
      data: {
        externalMessageId: result.externalMessageId ?? message.externalMessageId,
        rawPayload: {
          ...rawPayload,
          [providerKey]: {
            attemptedAt: new Date().toISOString(),
            payload: result.rawPayload
          }
        } as Prisma.InputJsonValue,
        status: result.status
      },
      include: this.messageInclude()
    });

    await this.auditLogs.create({
      action: "message.retry",
      actorUserId: user.sub,
      entityId: message.id,
      entityType: "message",
      metadata: {
        channel: conversation.channel,
        conversationId,
        status: result.status
      },
      organizationId
    });

    return updated;
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
              where: { channel: { in: ["instagram", "messenger", "whatsapp"] } },
              select: { channel: true, externalId: true }
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

  private getChannelRecipient(
    conversation: {
      contact: { channels: Array<{ channel: string; externalId: string }>; phone: string | null };
    },
    channel: string
  ) {
    return conversation.contact.channels.find((item) => item.channel === channel)?.externalId;
  }

  private asPayloadRecord(payload: Prisma.JsonValue | null) {
    return payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  }
}
