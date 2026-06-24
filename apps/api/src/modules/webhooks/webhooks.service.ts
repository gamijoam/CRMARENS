import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { MetaWhatsAppWebhookDto } from "./dto/meta-whatsapp-webhook.dto";

interface IncomingWhatsappMessage {
  externalMessageId: string;
  from: string;
  profileName?: string;
  text?: string;
  timestamp?: string;
  type: string;
}

@Injectable()
export class WebhooksService {
  constructor(
    private readonly auditLogs: AuditLogsService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  async receiveMetaWhatsapp(dto: MetaWhatsAppWebhookDto) {
    const organizationId = this.config.get<string>("META_WHATSAPP_ORGANIZATION_ID");
    if (!organizationId) {
      throw new NotFoundException("META_WHATSAPP_ORGANIZATION_ID is not configured");
    }

    const connection = await this.prisma.channelConnection.findFirst({
      where: {
        organizationId,
        channel: "whatsapp",
        status: "active"
      },
      orderBy: { createdAt: "asc" },
      select: { id: true }
    });
    const messages = this.extractMessages(dto);
    let processed = 0;
    let skipped = 0;

    for (const message of messages) {
      if (!message.text || message.type !== "text") {
        skipped += 1;
        continue;
      }

      const existingMessage = await this.prisma.message.findFirst({
        where: { externalMessageId: message.externalMessageId },
        select: { id: true }
      });
      if (existingMessage) {
        skipped += 1;
        continue;
      }

      await this.persistIncomingMessage(organizationId, connection?.id, message, dto);
      processed += 1;
    }

    return {
      processed,
      skipped,
      received: messages.length
    };
  }

  private extractMessages(dto: MetaWhatsAppWebhookDto) {
    const messages: IncomingWhatsappMessage[] = [];

    for (const entry of dto.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const contacts = change.value?.contacts ?? [];
        for (const message of change.value?.messages ?? []) {
          const contact = contacts.find((item) => item.wa_id === message.from);
          if (!message.from || !message.id) {
            continue;
          }

          messages.push({
            externalMessageId: message.id,
            from: this.normalizePhone(message.from),
            profileName: contact?.profile?.name,
            text: message.text?.body,
            timestamp: message.timestamp,
            type: message.type ?? "unknown"
          });
        }
      }
    }

    return messages;
  }

  private async persistIncomingMessage(
    organizationId: string,
    channelConnectionId: string | undefined,
    message: IncomingWhatsappMessage,
    rawPayload: MetaWhatsAppWebhookDto
  ) {
    const createdAt = message.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date();
    const contact = await this.findOrCreateContact(organizationId, message);
    const conversation = await this.findOrCreateConversation(organizationId, contact.id, channelConnectionId, createdAt);

    const savedMessage = await this.prisma.$transaction(async (tx) => {
      const nextMessage = await tx.message.create({
        data: {
          channel: "whatsapp",
          conversationId: conversation.id,
          createdAt,
          direction: "inbound",
          externalMessageId: message.externalMessageId,
          rawPayload: rawPayload as Prisma.InputJsonValue,
          status: "delivered",
          text: message.text,
          type: "text"
        }
      });

      await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: createdAt,
          status: "open"
        }
      });

      return nextMessage;
    });

    await this.auditLogs.create({
      action: "message.inbound",
      entityId: savedMessage.id,
      entityType: "message",
      metadata: {
        assignedUserId: conversation.assignedUserId,
        channel: "whatsapp",
        contactId: contact.id,
        conversationId: conversation.id,
        externalMessageId: message.externalMessageId,
        source: "meta.whatsapp.webhook"
      },
      organizationId
    });

    return savedMessage;
  }

  private async findOrCreateContact(organizationId: string, message: IncomingWhatsappMessage) {
    const existingByChannel = await this.prisma.contact.findFirst({
      where: {
        organizationId,
        channels: {
          some: {
            channel: "whatsapp",
            externalId: message.from
          }
        }
      },
      select: { id: true, fullName: true }
    });

    if (existingByChannel) {
      return existingByChannel;
    }

    const existingByPhone = await this.prisma.contact.findFirst({
      where: {
        organizationId,
        phone: message.from
      },
      select: { id: true, fullName: true }
    });

    if (existingByPhone) {
      await this.prisma.contactChannel.create({
        data: {
          channel: "whatsapp",
          contactId: existingByPhone.id,
          displayName: message.profileName,
          externalId: message.from
        }
      });
      return existingByPhone;
    }

    return this.prisma.contact.create({
      data: {
        fullName: message.profileName ?? message.from,
        organizationId,
        phone: message.from,
        tags: ["whatsapp"],
        channels: {
          create: {
            channel: "whatsapp",
            displayName: message.profileName,
            externalId: message.from
          }
        }
      },
      select: { id: true, fullName: true }
    });
  }

  private async findOrCreateConversation(
    organizationId: string,
    contactId: string,
    channelConnectionId: string | undefined,
    createdAt: Date
  ) {
    const existingConversation = await this.prisma.conversation.findFirst({
      where: {
        organizationId,
        contactId,
        channel: "whatsapp",
        status: "open"
      },
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      select: { assignedUserId: true, id: true }
    });

    if (existingConversation) {
      return existingConversation;
    }

    const conversation = await this.prisma.conversation.create({
      data: {
        channel: "whatsapp",
        channelConnectionId,
        contactId,
        createdAt,
        lastMessageAt: createdAt,
        organizationId
      },
      select: { assignedUserId: true, id: true }
    });

    await this.auditLogs.create({
      action: "conversation.created",
      entityId: conversation.id,
      entityType: "conversation",
      metadata: {
        channel: "whatsapp",
        contactId,
        source: "meta.whatsapp.webhook"
      },
      organizationId
    });

    return conversation;
  }

  private normalizePhone(value: string) {
    return value.replace(/[^\d+]/g, "");
  }
}
