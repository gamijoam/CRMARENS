import { Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common";
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
  profileName?: string;
  text: string;
  timestamp?: number | string;
}

interface InstagramMessageLookupRef {
  externalMessageId: string;
  timestamp?: number | string;
}

interface InstagramGraphConversationMessage {
  createdTime: string;
  externalMessageId: string;
  fromId: string;
  fromName?: string;
  text: string;
}

@Injectable()
export class WebhooksService implements OnModuleInit {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly auditLogs: AuditLogsService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  onModuleInit() {
    const shouldSync = this.config.get<string>("META_INSTAGRAM_SYNC_ON_STARTUP") ?? "true";
    if (shouldSync.toLowerCase() !== "true") {
      return;
    }

    void this.syncInstagramOnStartup().catch((error: unknown) => {
      this.logger.error(
        `Instagram startup sync failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    });
  }

  async syncInstagramOnStartup() {
    const organizationId = this.config.get<string>("META_INSTAGRAM_ORGANIZATION_ID");
    const accessToken = this.config.get<string>("META_INSTAGRAM_ACCESS_TOKEN");

    if (!organizationId || !accessToken) {
      this.logger.warn("Instagram startup sync skipped: organization id or access token is not configured");
      return {
        processed: 0,
        skipped: 0,
        syncedConversations: 0
      };
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

    const result = await this.syncRecentInstagramConversationHistories(organizationId, connection?.id, {
      object: "instagram"
    });

    this.logger.log(
      `Instagram startup sync processed=${result.processed} skipped=${result.skipped} syncedConversations=${result.syncedConversations}`
    );

    return result;
  }

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

    const [organization, connection] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { id: true }
      }),
      this.prisma.channelConnection.findFirst({
        where: {
          organizationId,
          channel: "instagram",
          status: "active"
        },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true }
      })
    ]);

    if (!organization) {
      throw new NotFoundException(`META_INSTAGRAM_ORGANIZATION_ID does not exist: ${organizationId}`);
    }

    if (!connection) {
      this.logger.warn(`Instagram webhook has no active channel connection for organization=${organizationId}`);
    }

    this.logger.log(
      `Instagram webhook context organization=${organizationId} connection=${connection?.name ?? "none"}`
    );

    const directMessages = this.extractInstagramMessages(dto);
    const fallbackRefs = this.extractInstagramMessageLookupRefs(dto).filter(
      (ref) => !directMessages.some((message) => message.externalMessageId === ref.externalMessageId)
    );
    const fallbackMessages = await this.fetchInstagramMessagesByIds(fallbackRefs);
    const messages = [...directMessages, ...fallbackMessages];
    const technicalEvents = this.countInstagramTechnicalEvents(dto);
    let processed = 0;
    let skipped = 0;
    let syncedFromGraph = 0;

    if (technicalEvents > 0) {
      this.logger.log(`Instagram technical events ignored count=${technicalEvents}`);
    }
    this.logger.log(
      `Instagram webhook received=${messages.length} direct=${directMessages.length} fallback=${fallbackMessages.length} technical=${technicalEvents}`
    );

    for (const message of messages) {
      if (!message.text) {
        skipped += 1;
        this.logger.warn(`Instagram webhook skipped message without text id=${message.externalMessageId}`);
        continue;
      }

      const existingMessage = await this.prisma.message.findFirst({
        where: {
          channel: "instagram",
          conversation: { organizationId },
          externalMessageId: message.externalMessageId
        },
        select: { id: true }
      });
      if (existingMessage) {
        skipped += 1;
        this.logger.warn(`Instagram webhook skipped duplicate id=${message.externalMessageId}`);
        continue;
      }

      await this.persistIncomingInstagramMessage(organizationId, connection?.id, message, dto);
      this.logger.log(`Instagram inbound message saved id=${message.externalMessageId} sender=${message.from}`);
      await this.maybeSendInstagramAutoReply(message.from);
      processed += 1;
    }

    if (
      messages.length === 0 &&
      fallbackRefs.length === 0 &&
      technicalEvents === 0 &&
      this.shouldSyncInstagramGraphHistory(dto)
    ) {
      const syncResult = await this.syncRecentInstagramConversationHistories(organizationId, connection?.id, dto);
      processed += syncResult.processed;
      skipped += syncResult.skipped;
      syncedFromGraph = syncResult.syncedConversations;
    }

    this.logger.log(
      `Instagram webhook processed=${processed} skipped=${skipped} received=${messages.length} syncedFromGraph=${syncedFromGraph}`
    );

    if (processed === 0 && messages.length === 0 && technicalEvents === 0) {
      this.logger.warn("Instagram webhook did not contain a text message to save");
    }

    return {
      processed,
      received: messages.length,
      skipped,
      syncedFromGraph
    };
  }

  async syncInstagramConversationHistory(
    metaConversationId: string,
    organizationId = this.config.get<string>("META_INSTAGRAM_ORGANIZATION_ID"),
    channelConnectionId?: string,
    rawPayload: Prisma.InputJsonValue = {}
  ) {
    if (!organizationId) {
      throw new NotFoundException("META_INSTAGRAM_ORGANIZATION_ID is not configured");
    }

    const graphMessages = await this.fetchInstagramConversationMessages(metaConversationId);
    const latestSyncedAt = await this.getLatestSyncedInstagramConversationTime(organizationId, metaConversationId);
    const existingIds = new Set(
      (
        await this.prisma.message.findMany({
          where: {
            externalMessageId: { in: graphMessages.map((message) => message.externalMessageId) }
          },
          select: { externalMessageId: true }
        })
      )
        .map((message) => message.externalMessageId)
        .filter(Boolean) as string[]
    );

    const ownIds = this.getInstagramOwnAccountIds();
    const participant = this.pickInstagramConversationParticipant(graphMessages, ownIds);
    let processed = 0;
    let skipped = 0;

    for (const graphMessage of graphMessages.sort(
      (left, right) => new Date(left.createdTime).getTime() - new Date(right.createdTime).getTime()
    )) {
      const createdAt = new Date(graphMessage.createdTime);
      if (Number.isNaN(createdAt.getTime()) || existingIds.has(graphMessage.externalMessageId)) {
        skipped += 1;
        continue;
      }

      if (latestSyncedAt && createdAt <= latestSyncedAt) {
        skipped += 1;
        continue;
      }

      const direction = ownIds.has(graphMessage.fromId) ? "outbound" : "inbound";
      const contactExternalId = direction === "inbound" ? graphMessage.fromId : participant.fromId;

      await this.persistInstagramGraphMessage(
        organizationId,
        channelConnectionId,
        {
          externalMessageId: graphMessage.externalMessageId,
          from: contactExternalId,
          profileName: direction === "inbound" ? graphMessage.fromName : participant.fromName,
          text: graphMessage.text,
          timestamp: graphMessage.createdTime
        },
        direction,
        {
          metaInstagramConversationId: metaConversationId,
          source: "meta.instagram.graph.conversation_history",
          payload: rawPayload,
          graphMessage
        } as unknown as Prisma.InputJsonValue
      );
      processed += 1;
    }

    this.logger.log(
      `Instagram Graph history conversation=${metaConversationId} fetched=${graphMessages.length} processed=${processed} skipped=${skipped}`
    );

    return {
      fetched: graphMessages.length,
      processed,
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

  private async syncRecentInstagramConversationHistories(
    organizationId: string,
    channelConnectionId: string | undefined,
    rawPayload: MetaInstagramWebhookDto
  ) {
    const metaConversationIds = await this.fetchRecentInstagramConversationIds();
    let processed = 0;
    let skipped = 0;
    let syncedConversations = 0;

    for (const metaConversationId of metaConversationIds) {
      const result = await this.syncInstagramConversationHistory(
        metaConversationId,
        organizationId,
        channelConnectionId,
        rawPayload as Prisma.InputJsonValue
      );
      processed += result.processed;
      skipped += result.skipped;
      syncedConversations += 1;
    }

    return {
      processed,
      skipped,
      syncedConversations
    };
  }

  private async maybeSendInstagramAutoReply(recipientId: string) {
    const text = this.config.get<string>("META_INSTAGRAM_AUTO_REPLY_TEXT");
    if (!text) {
      return;
    }

    const result = await this.sendInstagramTextMessage(recipientId, text);
    if (result.ok) {
      this.logger.log(`Instagram auto reply sent to=${recipientId} messageId=${result.messageId ?? "unknown"}`);
      return;
    }

    this.logger.warn(`Instagram auto reply failed to=${recipientId} payload=${JSON.stringify(result.payload)}`);
  }

  private async sendInstagramTextMessage(recipientId: string, text: string) {
    const accessToken = this.config.get<string>("META_INSTAGRAM_ACCESS_TOKEN");
    const graphVersion = this.config.get<string>("META_INSTAGRAM_API_VERSION") ?? "v25.0";

    if (!accessToken) {
      return {
        ok: false,
        payload: { error: "META_INSTAGRAM_ACCESS_TOKEN is not configured" } as Record<string, unknown>
      };
    }

    try {
      const response = await fetch(`https://graph.facebook.com/${graphVersion}/me/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text }
        })
      });
      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

      return {
        messageId: typeof payload.message_id === "string" ? payload.message_id : undefined,
        ok: response.ok,
        payload
      };
    } catch (error) {
      return {
        ok: false,
        payload: {
          error: error instanceof Error ? error.message : "Unknown Instagram API error"
        }
      };
    }
  }

  private async fetchRecentInstagramConversationIds() {
    const accessToken = this.config.get<string>("META_INSTAGRAM_ACCESS_TOKEN");
    const graphVersion = this.config.get<string>("META_INSTAGRAM_API_VERSION") ?? "v25.0";

    if (!accessToken) {
      this.logger.warn("Instagram Graph history sync skipped: META_INSTAGRAM_ACCESS_TOKEN is not configured");
      return [];
    }

    const url = new URL(`https://graph.facebook.com/${graphVersion}/me/conversations`);
    url.searchParams.set("platform", "instagram");
    url.searchParams.set("limit", "10");

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      this.logger.warn(`Instagram Graph conversations fetch failed: ${JSON.stringify(payload)}`);
      return [];
    }

    const data = Array.isArray(payload.data) ? payload.data : [];
    return data
      .map((item) => this.asRecord(item)?.id)
      .filter((id): id is string => typeof id === "string");
  }

  private async fetchInstagramConversationMessages(metaConversationId: string) {
    const accessToken = this.config.get<string>("META_INSTAGRAM_ACCESS_TOKEN");
    const graphVersion = this.config.get<string>("META_INSTAGRAM_API_VERSION") ?? "v25.0";

    if (!accessToken) {
      this.logger.warn("Instagram Graph history sync skipped: META_INSTAGRAM_ACCESS_TOKEN is not configured");
      return [];
    }

    const url = new URL(`https://graph.facebook.com/${graphVersion}/${metaConversationId}`);
    url.searchParams.set("fields", "messages.limit(50){id,message,from,created_time}");

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      this.logger.warn(`Instagram Graph conversation history fetch failed: ${JSON.stringify(payload)}`);
      return [];
    }

    const messages = this.asRecord(payload.messages);
    const data = Array.isArray(messages?.data) ? messages.data : [];

    return data.flatMap((item): InstagramGraphConversationMessage[] => {
      const message = this.asRecord(item);
      const from = this.asRecord(message?.from);
      const externalMessageId = typeof message?.id === "string" ? message.id : undefined;
      const text = typeof message?.message === "string" ? message.message : undefined;
      const fromId = typeof from?.id === "string" ? from.id : undefined;
      const createdTime = typeof message?.created_time === "string" ? message.created_time : undefined;

      if (!externalMessageId || !text || !fromId || !createdTime) {
        return [];
      }

      return [
        {
          createdTime,
          externalMessageId,
          fromId,
          fromName: typeof from?.name === "string" ? from.name : undefined,
          text
        }
      ];
    });
  }

  private async fetchInstagramMessagesByIds(refs: InstagramMessageLookupRef[]) {
    const uniqueRefs = Array.from(
      refs.reduce((map, ref) => {
        if (!map.has(ref.externalMessageId)) {
          map.set(ref.externalMessageId, ref);
        }
        return map;
      }, new Map<string, InstagramMessageLookupRef>())
    ).map(([, ref]) => ref);

    const messages: IncomingInstagramMessage[] = [];

    for (const ref of uniqueRefs) {
      const message = await this.fetchInstagramMessageById(ref.externalMessageId, ref.timestamp);
      if (message) {
        messages.push(message);
      }
    }

    return messages;
  }

  private async fetchInstagramMessageById(externalMessageId: string, timestamp?: number | string) {
    const accessToken = this.config.get<string>("META_INSTAGRAM_ACCESS_TOKEN");
    const graphVersion = this.config.get<string>("META_INSTAGRAM_API_VERSION") ?? "v25.0";

    if (!accessToken) {
      this.logger.warn("Instagram message lookup skipped: META_INSTAGRAM_ACCESS_TOKEN is not configured");
      return undefined;
    }

    const url = new URL(`https://graph.facebook.com/${graphVersion}/${externalMessageId}`);
    url.searchParams.set("fields", "message,from,created_time");

    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

      if (!response.ok) {
        const error = this.asRecord(payload.error);
        this.logger.warn(
          `Instagram message lookup skipped id=${externalMessageId} code=${error?.code ?? "unknown"}`
        );
        return undefined;
      }

      const text = typeof payload.message === "string" ? payload.message : undefined;
      const from = this.asRecord(payload.from);
      const fromId = typeof from?.id === "string" ? from.id : undefined;

      if (!text || !fromId) {
        this.logger.log(`Instagram message lookup returned no text id=${externalMessageId}`);
        return undefined;
      }

      return {
        externalMessageId,
        from: fromId,
        profileName: typeof from?.name === "string" ? from.name : undefined,
        text,
        timestamp: typeof payload.created_time === "string" ? payload.created_time : timestamp
      };
    } catch (error) {
      this.logger.warn(
        `Instagram message lookup network error id=${externalMessageId} message=${
          error instanceof Error ? error.message : "unknown"
        }`
      );
      return undefined;
    }
  }

  private async getLatestSyncedInstagramConversationTime(organizationId: string, metaConversationId: string) {
    const recentMessages = await this.prisma.message.findMany({
      where: {
        channel: "instagram",
        conversation: { organizationId }
      },
      orderBy: { createdAt: "desc" },
      select: {
        createdAt: true,
        rawPayload: true
      },
      take: 500
    });

    return (
      recentMessages.find((message) => {
        const rawPayload = this.asRecord(message.rawPayload);
        return rawPayload?.metaInstagramConversationId === metaConversationId;
      })?.createdAt ?? null
    );
  }

  private getInstagramOwnAccountIds() {
    return new Set(
      [
        this.config.get<string>("META_INSTAGRAM_BUSINESS_ACCOUNT_ID"),
        this.config.get<string>("META_INSTAGRAM_PAGE_ID")
      ].filter((value): value is string => Boolean(value))
    );
  }

  private pickInstagramConversationParticipant(
    messages: InstagramGraphConversationMessage[],
    ownIds: Set<string>
  ) {
    return messages.find((message) => !ownIds.has(message.fromId)) ?? messages[0];
  }

  private shouldSyncInstagramGraphHistory(dto: MetaInstagramWebhookDto) {
    if (dto.object !== "instagram") {
      return false;
    }

    return (dto.entry ?? []).some((entry) => (entry.messaging?.length ?? 0) > 0 || (entry.changes?.length ?? 0) > 0);
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
        if (!event.sender?.id || !event.message?.mid || typeof event.message.text !== "string") {
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

  private extractInstagramMessageLookupRefs(dto: MetaInstagramWebhookDto) {
    const refs: InstagramMessageLookupRef[] = [];

    if (dto.field === "messages" && dto.value) {
      const ref = this.extractInstagramMessageLookupRef(dto.value);
      if (ref) {
        refs.push(ref);
      }
    }

    for (const entry of dto.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== "messages" || !change.value) {
          continue;
        }

        const ref = this.extractInstagramMessageLookupRef(change.value);
        if (ref) {
          refs.push(ref);
        }
      }

      for (const event of entry.messaging ?? []) {
        const ref = this.extractInstagramMessagingLookupRef(event as unknown as Record<string, unknown>);
        if (ref) {
          refs.push(ref);
        }
      }
    }

    if (refs.length > 0) {
      this.logger.log(`Instagram fallback lookup refs count=${refs.length}`);
    }

    return refs;
  }

  private extractInstagramMessageValue(value: Record<string, unknown>) {
    if (this.isInstagramTechnicalEvent(value)) {
      return undefined;
    }

    const sender = this.asRecord(value.sender);
    const message = this.asRecord(value.message);
    const senderId = typeof sender?.id === "string" ? sender.id : undefined;
    const externalMessageId = typeof message?.mid === "string" ? message.mid : undefined;
    const text = typeof message?.text === "string" ? message.text : undefined;

    if (!senderId || !externalMessageId || !text) {
      return undefined;
    }

    return {
      externalMessageId,
      from: senderId,
      text,
      timestamp: typeof value.timestamp === "number" || typeof value.timestamp === "string" ? value.timestamp : undefined
    };
  }

  private extractInstagramMessageLookupRef(value: Record<string, unknown>) {
    if (this.isInstagramTechnicalEvent(value)) {
      return undefined;
    }

    const message = this.asRecord(value.message);
    const messageText = typeof message?.text === "string" ? message.text : undefined;
    const externalMessageId = typeof message?.mid === "string" && !messageText ? message.mid : undefined;

    if (!externalMessageId) {
      return undefined;
    }

    return {
      externalMessageId,
      timestamp: typeof value.timestamp === "number" || typeof value.timestamp === "string" ? value.timestamp : undefined
    };
  }

  private extractInstagramMessagingLookupRef(value: Record<string, unknown>) {
    if (this.isInstagramTechnicalEvent(value)) {
      return undefined;
    }

    const message = this.asRecord(value.message);
    const messageText = typeof message?.text === "string" ? message.text : undefined;
    const externalMessageId = typeof message?.mid === "string" && !messageText ? message.mid : undefined;

    if (!externalMessageId) {
      return undefined;
    }

    return {
      externalMessageId,
      timestamp: typeof value.timestamp === "number" || typeof value.timestamp === "string" ? value.timestamp : undefined
    };
  }

  private countInstagramTechnicalEvents(dto: MetaInstagramWebhookDto) {
    let count = 0;

    if (dto.value && this.isInstagramTechnicalEvent(dto.value)) {
      count += 1;
    }

    for (const entry of dto.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.value && this.isInstagramTechnicalEvent(change.value)) {
          count += 1;
        }
      }

      for (const event of entry.messaging ?? []) {
        if (this.isInstagramTechnicalEvent(event as unknown as Record<string, unknown>)) {
          count += 1;
        }
      }
    }

    return count;
  }

  private isInstagramTechnicalEvent(value: Record<string, unknown>) {
    return [
      "delivery",
      "message_edit",
      "message_reactions",
      "messaging_handover",
      "messaging_optins",
      "messaging_postbacks",
      "messaging_referral",
      "messaging_seen",
      "read",
      "reaction",
      "standby"
    ].some((field) => Boolean(this.asRecord(value[field])));
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

  private async persistInstagramGraphMessage(
    organizationId: string,
    channelConnectionId: string | undefined,
    message: IncomingInstagramMessage,
    direction: "inbound" | "outbound",
    rawPayload: Prisma.InputJsonValue
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
          direction,
          externalMessageId: message.externalMessageId,
          rawPayload,
          status: direction === "inbound" ? "delivered" : "sent",
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
      action: direction === "inbound" ? "message.inbound" : "message.outbound_synced",
      entityId: savedMessage.id,
      entityType: "message",
      metadata: {
        assignedUserId: conversation.assignedUserId,
        channel: "instagram",
        contactId: contact.id,
        conversationId: conversation.id,
        direction,
        externalMessageId: message.externalMessageId,
        source: "meta.instagram.graph.conversation_history"
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

    if (typeof timestamp === "string") {
      const parsedDate = new Date(timestamp);
      if (!Number.isNaN(parsedDate.getTime())) {
        return parsedDate;
      }
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
        fullName: message.profileName ?? `Instagram ${message.from}`,
        organizationId,
        tags: ["instagram"],
        channels: {
          create: {
            displayName: message.profileName,
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
