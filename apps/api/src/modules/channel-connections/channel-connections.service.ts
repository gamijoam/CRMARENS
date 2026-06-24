import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateChannelConnectionDto } from "./dto/create-channel-connection.dto";
import { UpdateChannelConnectionStatusDto } from "./dto/update-channel-connection-status.dto";

@Injectable()
export class ChannelConnectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, dto: CreateChannelConnectionDto) {
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

    return this.prisma.channelConnection.create({
      data: {
        organizationId,
        channel: dto.channel,
        name: dto.name,
        externalAccountId: dto.externalAccountId,
        config: { mode: "simulated" }
      },
      include: this.connectionInclude()
    });
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

  async updateStatus(organizationId: string, id: string, dto: UpdateChannelConnectionStatusDto) {
    await this.findOne(organizationId, id);

    return this.prisma.channelConnection.update({
      where: { id },
      data: { status: dto.status },
      include: this.connectionInclude()
    });
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
