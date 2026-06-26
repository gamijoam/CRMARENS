import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
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
    private readonly auditLogs: AuditLogsService
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
    const nextConfig = {
      ...currentConfig,
      ...(dto.accessToken ? { accessToken: dto.accessToken.trim(), accessTokenUpdatedAt: new Date().toISOString() } : {})
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

  private asConfigRecord(config: Prisma.JsonValue | null) {
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
}
