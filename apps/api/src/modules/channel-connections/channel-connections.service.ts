import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { CreateChannelConnectionDto } from "./dto/create-channel-connection.dto";
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

    return connection;
  }

  findMany(organizationId: string) {
    return this.prisma.channelConnection.findMany({
      where: { organizationId },
      include: this.connectionInclude(),
      orderBy: [{ status: "asc" }, { channel: "asc" }, { createdAt: "asc" }]
    });
  }

  async findOne(organizationId: string, id: string) {
    const connection = await this.prisma.channelConnection.findFirst({
      where: { id, organizationId },
      include: this.connectionInclude()
    });

    if (!connection) {
      throw new NotFoundException("Channel connection not found");
    }

    return connection;
  }

  async updateStatus(
    organizationId: string,
    actorUserId: string,
    id: string,
    dto: UpdateChannelConnectionStatusDto
  ) {
    await this.findOne(organizationId, id);

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

    return connection;
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
}
