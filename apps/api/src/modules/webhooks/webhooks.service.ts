import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { MetaInstagramWebhookDto } from "./dto/meta-instagram-webhook.dto";
import { MetaWhatsAppWebhookDto } from "./dto/meta-whatsapp-webhook.dto";

interface IncomingWhatsappMessage {
  externalMessageId: string;
  from: string;
  profileName?: string;
  text?: string;
  timestamp?: string;
  type: string;
}

interface IncomingWhatsappStatus {
  errors?: Array<Record<string, unknown>>;
  externalMessageId: string;
  recipientId?: string;
  status: string;
  timestamp?: string;
}

interface IncomingInstagramMessage {
  externalMessageId: string;
  from: string;
  text?: string;
  timestamp?: number | string;
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
    const statuses = this.extractStatuses(dto);
    let processed = 0;
    let skipped = 0;
    let statusesProcessed = 0;
    let statusesSkipped = 0;

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

    for (const status of statuses) {
      const updated = await this.persistStatusUpdate(organizationId, status, dto);
      if (updated) {
        statusesProcessed += 1;
      } else {
        statusesSkipped += 1;
      }
    }

    return {
      processed,
      skipped,
      received: messages.length,
      statusesProcessed,
      statusesReceived: statuses.length,
      statusesSkipped
    };
  }

  async receiveMetaInstagram(dto: MetaInstagramWebhookDto) {
    const organizationId = this.config.get<string>("META_INSTAGRAM_ORGANIZATION_ID");
    if (!organizationId) {
      throw new NotFoundException("META_INSTAGRAM_ORGANIZATION_ID is not configured");
    }

    const connection = await this.prisma.channelConnection.findFirst({
      where: {
        organizationId,
        channel: "instagram",
        status: "active"
      },
      orderBy: { createdAt: "asc" },
      select: { id: true }
    });
    const messages = this.extractInstagramMessages(dto);
    let processed = 0;
    let skipped = 0;

    for (const message of messages) {
      if (!message.text) {
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

      await this.persistIncomingInstagramMessage(organizationId, connection?.id, message, dto);
      processed += 1;
    }

    return {
      processed,
      received: messages.length,
      skipped
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

  private extractStatuses(dto: MetaWhatsAppWebhookDto) {
    const statuses: IncomingWhatsappStatus[] = [];

    for (const entry of dto.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const status of change.value?.statuses ?? []) {
          if (!status.id || !status.status) {
            continue;
          }

          statuses.push({
            errors: status.errors as Array<Record<string, unknown>> | undefined,
            externalMessageId: status.id,
            recipientId: status.recipient_id,
            status: status.status,
            timestamp: status.timestamp
          });
        }
      }
    }

    return statuses;
  }

  private extractInstagramMessages(dto: MetaInstagramWebhookDto) {
    const messages: IncomingInstagramMessage[] = [];

    if (dto.field === "messages" && dto.value) {
      const message = this.extractInstagramMessageValue(dto.value);
      if (message) {
        messages.push(message);
      }
    }

    for (const entry of dto.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== "messages" || !change.value) {
          continue;
        }

        const message = this.extractInstagramMessageValue(change.value);
        if (message) {
          messages.push(message);
        }
      }

      for (const event of entry.messaging ?? []) {
        if (!event.sender?.id || !event.message?.mid) {
          continue;
        }

        messages.push({
          externalMessageId: event.message.mid,
          from: event.sender.id,
          text: event.message.text,
          timestamp: event.timestamp
        });
      }
    }

    return messages;
  }

  private extractInstagramMessageValue(value: Record<string, unknown>) {
    const sender = this.asRecord(value.sender);
    const message = this.asRecord(value.message);
    const senderId = typeof sender?.id === "string" ? sender.id : undefined;
    const externalMessageId = typeof message?.mid === "string" ? message.mid : undefined;

    if (!senderId || !externalMessageId || !message) {
      return undefined;
    }

    return {
      externalMessageId,
      from: senderId,
      text: typeof message.text === "string" ? message.text : undefined,
      timestamp: typeof value.timestamp === "number" || typeof value.timestamp === "string" ? value.timestamp : undefined
    };
  }

  private asRecord(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
  }

  private async persistStatusUpdate(
    organizationId: string,
    status: IncomingWhatsappStatus,
    rawPayload: MetaWhatsAppWebhookDto
  ) {
    const message = await this.prisma.message.findFirst({
      where: {
        externalMessageId: status.externalMessageId,
        conversation: { organizationId }
      },
      select: {
        conversation: {
          select: { assignedUserId: true, id: true }
        },
        id: true,
        rawPayload: true,
        status: true
      }
    });

    if (!message) {
      return false;
    }

    const nextStatus = this.mapMessageStatus(status.status);
    const rawPayloadValue =
      message.rawPayload && typeof message.rawPayload === "object" && !Array.isArray(message.rawPayload)
        ? (message.rawPayload as Record<string, unknown>)
        : {};

    await this.prisma.message.update({
      where: { id: message.id },
      data: {
        rawPayload: ({
          ...rawPayloadValue,
          whatsappStatus: {
            errors: status.errors,
            payload: rawPayload,
            recipientId: status.recipientId,
            status: status.status,
            timestamp: status.timestamp
          }
        } as unknown) as Prisma.InputJsonValue,
        status: nextStatus
      }
    });

    if (message.status !== nextStatus) {
      await this.auditLogs.create({
        action: "message.status_changed",
        entityId: message.id,
        entityType: "message",
        metadata: {
          assignedUserId: message.conversation.assignedUserId,
          conversationId: message.conversation.id,
          externalMessageId: status.externalMessageId,
          fromStatus: message.status,
          providerStatus: status.status,
          status: nextStatus
        },
        organizationId
      });
    }

    return true;
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

  private async persistIncomingInstagramMessage(
    organizationId: string,
    channelConnectionId: string | undefined,
    message: IncomingInstagramMessage,
    rawPayload: MetaInstagramWebhookDto
  ) {
    const createdAt = this.parseInstagramTimestamp(message.timestamp);
    const contact = await this.findOrCreateInstagramContact(organizationId, message);
    const conversation = await this.findOrCreateChannelConversation(
      organizationId,
      contact.id,
      "instagram",
      channelConnectionId,
      createdAt
    );

    const savedMessage = await this.prisma.$transaction(async (tx) => {
      const nextMessage = await tx.message.create({
        data: {
          channel: "instagram",
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
        channel: "instagram",
        contactId: contact.id,
        conversationId: conversation.id,
        externalMessageId: message.externalMessageId,
        source: "meta.instagram.webhook"
      },
      organizationId
    });

    return savedMessage;
  }

  private parseInstagramTimestamp(timestamp: number | string | undefined) {
    const now = new Date();
    if (timestamp === undefined) {
      return now;
    }

    const value = typeof timestamp === "string" ? Number(timestamp) : timestamp;
    if (!Number.isFinite(value)) {
      return now;
    }

    const parsed = new Date(value < 10_000_000_000 ? value * 1000 : value);
    const oldestAccepted = new Date("2024-01-01T00:00:00.000Z");
    const newestAccepted = new Date(now.getTime() + 5 * 60 * 1000);

    if (parsed < oldestAccepted || parsed > newestAccepted) {
      return now;
    }

    return parsed;
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

  private async findOrCreateInstagramContact(organizationId: string, message: IncomingInstagramMessage) {
    const existingByChannel = await this.prisma.contact.findFirst({
      where: {
        organizationId,
        channels: {
          some: {
            channel: "instagram",
            externalId: message.from
          }
        }
      },
      select: { id: true, fullName: true }
    });

    if (existingByChannel) {
      return existingByChannel;
    }

    return this.prisma.contact.create({
      data: {
        fullName: `Instagram ${message.from}`,
        organizationId,
        tags: ["instagram"],
        channels: {
          create: {
            channel: "instagram",
            externalId: message.from,
            username: message.from
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

  private async findOrCreateChannelConversation(
    organizationId: string,
    contactId: string,
    channel: string,
    channelConnectionId: string | undefined,
    createdAt: Date
  ) {
    const existingConversation = await this.prisma.conversation.findFirst({
      where: {
        organizationId,
        contactId,
        channel,
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
        channel,
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
        channel,
        contactId,
        source: `meta.${channel}.webhook`
      },
      organizationId
    });

    return conversation;
  }

  private normalizePhone(value: string) {
    return value.replace(/[^\d+]/g, "");
  }

  private mapMessageStatus(status: string) {
    const normalizedStatus = status.toLowerCase();
    if (["delivered", "failed", "read", "sent"].includes(normalizedStatus)) {
      return normalizedStatus;
    }

    return "sent";
  }
}
