import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { CreateChannelConnectionDto } from "./dto/create-channel-connection.dto";
import { UpdateChannelConnectionConfigDto } from "./dto/update-channel-connection-config.dto";
import { UpdateChannelConnectionStatusDto } from "./dto/update-channel-connection-status.dto";

@Injectable()
export class ChannelConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
    private readonly config: ConfigService
  ) {}

  async create(organizationId: string, actorUserId: string, dto: CreateChannelConnectionDto) {
    const existingConnection = await this.prisma.channelConnection.findUnique({
      where: {
        organizationId_channel_name: {
          organizationId,
          channel: dto.channel,
          name: dto.name
        }
      },
      select: { id: true }
    });

    if (existingConnection) {
      throw new ConflictException("Channel connection already exists");
    }

    const connection = await this.prisma.channelConnection.create({
      data: {
        organizationId,
        channel: dto.channel,
        name: dto.name,
        externalAccountId: dto.externalAccountId,
        config: { mode: "simulated" }
      },
      include: this.connectionInclude()
    });

    await this.auditLogs.create({
      action: "channel_connection.created",
      actorUserId,
      entityId: connection.id,
      entityType: "channel_connection",
      metadata: { channel: connection.channel, name: connection.name },
      organizationId
    });

    return this.sanitizeConnection(connection);
  }

  findMany(organizationId: string) {
    return this.prisma.channelConnection.findMany({
      where: { organizationId },
      include: this.connectionInclude(),
      orderBy: [{ status: "asc" }, { channel: "asc" }, { createdAt: "asc" }]
    }).then((connections) => connections.map((connection) => this.sanitizeConnection(connection)));
  }

  async findOne(organizationId: string, id: string, includeSecret = false) {
    const connection = await this.prisma.channelConnection.findFirst({
      where: { id, organizationId },
      include: this.connectionInclude()
    });

    if (!connection) {
      throw new NotFoundException("Channel connection not found");
    }

    return includeSecret ? connection : this.sanitizeConnection(connection);
  }

  async updateStatus(
    organizationId: string,
    actorUserId: string,
    id: string,
    dto: UpdateChannelConnectionStatusDto
  ) {
    await this.findOne(organizationId, id, true);

    const connection = await this.prisma.channelConnection.update({
      where: { id },
      data: { status: dto.status },
      include: this.connectionInclude()
    });

    await this.auditLogs.create({
      action: "channel_connection.status_changed",
      actorUserId,
      entityId: id,
      entityType: "channel_connection",
      metadata: { channel: connection.channel, status: connection.status },
      organizationId
    });

    return this.sanitizeConnection(connection);
  }

  async updateConfig(
    organizationId: string,
    actorUserId: string,
    id: string,
    dto: UpdateChannelConnectionConfigDto
  ) {
    const currentConnection = await this.findOne(organizationId, id, true);
    const currentConfig = this.asConfigRecord(currentConnection.config);
    const trimmedAccessToken = dto.accessToken?.trim();
    const tokenHealth = trimmedAccessToken
      ? await this.validateInstagramAccessToken(trimmedAccessToken)
      : undefined;
    const nextConfig = {
      ...currentConfig,
      ...(trimmedAccessToken
        ? {
            accessToken: trimmedAccessToken,
            accessTokenUpdatedAt: new Date().toISOString(),
            instagramHealth: {
              ...this.asConfigRecord(currentConfig.instagramHealth),
              tokenCheckedAt: new Date().toISOString(),
              tokenError: tokenHealth?.error,
              tokenPageId: tokenHealth?.pageId,
              tokenPageName: tokenHealth?.pageName,
              tokenStatus: tokenHealth?.status
            }
          }
        : {})
    };

    const connection = await this.prisma.channelConnection.update({
      where: { id },
      data: {
        ...(dto.externalAccountId !== undefined ? { externalAccountId: dto.externalAccountId || null } : {}),
        config: nextConfig as Prisma.InputJsonValue
      },
      include: this.connectionInclude()
    });

    await this.auditLogs.create({
      action: "channel_connection.config_updated",
      actorUserId,
      entityId: id,
      entityType: "channel_connection",
      metadata: {
        channel: connection.channel,
        externalAccountIdUpdated: dto.externalAccountId !== undefined,
        tokenUpdated: Boolean(dto.accessToken)
      },
      organizationId
    });

    return this.sanitizeConnection(connection);
  }

  async testConnection(organizationId: string, actorUserId: string, id: string) {
    const currentConnection = await this.findOne(organizationId, id, true);
    const currentConfig = this.asConfigRecord(currentConnection.config);

    if (currentConnection.channel !== "instagram") {
      throw new ConflictException("Connection test is only available for Instagram right now");
    }

    const accessToken = typeof currentConfig.accessToken === "string" ? currentConfig.accessToken.trim() : "";
    const checkedAt = new Date().toISOString();
    const tokenHealth = accessToken
      ? await this.validateInstagramAccessToken(accessToken)
      : { error: "No access token configured", status: "invalid" };

    const connection = await this.prisma.channelConnection.update({
      where: { id },
      data: {
        config: {
          ...currentConfig,
          instagramHealth: {
            ...this.asConfigRecord(currentConfig.instagramHealth),
            lastConnectionTestAt: checkedAt,
            tokenCheckedAt: checkedAt,
            tokenError: tokenHealth.error,
            tokenPageId: tokenHealth.pageId,
            tokenPageName: tokenHealth.pageName,
            tokenStatus: tokenHealth.status
          }
        } as Prisma.InputJsonValue
      },
      include: this.connectionInclude()
    });

    await this.auditLogs.create({
      action: "channel_connection.tested",
      actorUserId,
      entityId: id,
      entityType: "channel_connection",
      metadata: {
        channel: connection.channel,
        status: tokenHealth.status
      },
      organizationId
    });

    return {
      connection: this.sanitizeConnection(connection),
      ok: tokenHealth.status === "valid",
      pageName: tokenHealth.pageName,
      status: tokenHealth.status,
      error: tokenHealth.error
    };
  }

  private connectionInclude() {
    return {
      _count: {
        select: {
          conversations: true
        }
      }
    } satisfies Prisma.ChannelConnectionInclude;
  }

  private sanitizeConnection<T extends { config: Prisma.JsonValue | null }>(connection: T) {
    const config = this.asConfigRecord(connection.config);
    const accessToken = typeof config.accessToken === "string" ? config.accessToken : undefined;
    const { accessToken: _accessToken, ...safeConfig } = config;

    return {
      ...connection,
      config: {
        ...safeConfig,
        accessTokenConfigured: Boolean(accessToken),
        accessTokenPreview: accessToken ? this.maskToken(accessToken) : undefined
      }
    };
  }

  private asConfigRecord(config: unknown) {
    return config && typeof config === "object" && !Array.isArray(config)
      ? (config as Record<string, unknown>)
      : {};
  }

  private maskToken(value: string) {
    if (value.length <= 10) {
      return "********";
    }

    return `${value.slice(0, 4)}...${value.slice(-4)}`;
  }

  private async validateInstagramAccessToken(accessToken: string) {
    const graphVersion = this.config.get<string>("META_INSTAGRAM_API_VERSION") ?? "v25.0";
    const url = new URL(`https://graph.facebook.com/${graphVersion}/me`);
    url.searchParams.set("fields", "id,name,instagram_business_account");

    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

      if (!response.ok) {
        const error = this.asConfigRecord(payload.error);
        return {
          error: typeof error.message === "string" ? error.message : "Meta rejected token",
          status: "invalid"
        };
      }

      return {
        pageId: typeof payload.id === "string" ? payload.id : undefined,
        pageName: typeof payload.name === "string" ? payload.name : undefined,
        status: "valid"
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Could not validate token",
        status: "unknown"
      };
    }
  }
}
