import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateContactDto } from "./dto/create-contact.dto";
import { ListContactsQueryDto } from "./dto/list-contacts-query.dto";
import { UpdateContactDto } from "./dto/update-contact.dto";

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  create(organizationId: string, dto: CreateContactDto) {
    return this.prisma.contact.create({
      data: {
        organizationId,
        fullName: dto.fullName,
        phone: dto.phone,
        email: dto.email,
        tags: dto.tags ?? [],
        channels: dto.channels?.length
          ? {
              create: dto.channels.map((channel) => ({
                channel: channel.channel,
                externalId: channel.externalId,
                displayName: channel.displayName,
                username: channel.username
              }))
            }
          : undefined
      },
      include: { channels: true }
    });
  }

  findMany(organizationId: string, query: ListContactsQueryDto) {
    const where: Prisma.ContactWhereInput = {
      organizationId,
      ...(query.search
        ? {
            OR: [
              { fullName: { contains: query.search, mode: "insensitive" } },
              { phone: { contains: query.search, mode: "insensitive" } },
              { email: { contains: query.search, mode: "insensitive" } },
              {
                channels: {
                  some: {
                    OR: [
                      { displayName: { contains: query.search, mode: "insensitive" } },
                      { username: { contains: query.search, mode: "insensitive" } },
                      { externalId: { contains: query.search, mode: "insensitive" } }
                    ]
                  }
                }
              }
            ]
          }
        : {})
    };

    return this.prisma.contact.findMany({
      where,
      include: { channels: true },
      orderBy: { createdAt: "desc" },
      take: 100
    });
  }

  async findOne(organizationId: string, id: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, organizationId },
      include: {
        channels: true,
        leads: {
          include: {
            pipeline: true,
            stage: true
          },
          orderBy: { createdAt: "desc" }
        },
        conversations: {
          orderBy: { lastMessageAt: "desc" },
          take: 10
        }
      }
    });

    if (!contact) {
      throw new NotFoundException("Contact not found");
    }

    return contact;
  }

  async update(organizationId: string, id: string, dto: UpdateContactDto) {
    await this.ensureContactExists(organizationId, id);

    return this.prisma.$transaction(async (tx) => {
      if (dto.channels) {
        await tx.contactChannel.deleteMany({
          where: { contactId: id }
        });
      }

      return tx.contact.update({
        where: { id },
        data: {
          fullName: dto.fullName,
          phone: dto.phone,
          email: dto.email,
          tags: dto.tags,
          channels: dto.channels
            ? {
                create: dto.channels.map((channel) => ({
                  channel: channel.channel,
                  externalId: channel.externalId,
                  displayName: channel.displayName,
                  username: channel.username
                }))
              }
            : undefined
        },
        include: { channels: true }
      });
    });
  }

  async remove(organizationId: string, id: string) {
    await this.ensureContactExists(organizationId, id);

    await this.prisma.contact.delete({
      where: { id }
    });

    return { deleted: true };
  }

  private async ensureContactExists(organizationId: string, id: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, organizationId },
      select: { id: true }
    });

    if (!contact) {
      throw new NotFoundException("Contact not found");
    }

    return contact;
  }
}
