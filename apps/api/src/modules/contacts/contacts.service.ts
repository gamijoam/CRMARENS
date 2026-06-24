import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { CreateContactDto } from "./dto/create-contact.dto";
import { ImportContactsDto } from "./dto/import-contacts.dto";
import { ListContactsQueryDto } from "./dto/list-contacts-query.dto";
import { UpdateContactDto } from "./dto/update-contact.dto";

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService
  ) {}

  async create(organizationId: string, actorUserId: string, dto: CreateContactDto) {
    const contact = await this.prisma.contact.create({
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

    await this.auditLogs.create({
      action: "contact.created",
      actorUserId,
      entityId: contact.id,
      entityType: "contact",
      metadata: { fullName: contact.fullName },
      organizationId
    });

    return contact;
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

  async remove(organizationId: string, actorUserId: string, id: string) {
    await this.ensureContactExists(organizationId, id);

    await this.prisma.contact.delete({
      where: { id }
    });

    await this.auditLogs.create({
      action: "contact.deleted",
      actorUserId,
      entityId: id,
      entityType: "contact",
      organizationId
    });

    return { deleted: true };
  }

  async importMany(organizationId: string, actorUserId: string, dto: ImportContactsDto) {
    const normalizedRows = dto.contacts.map((contact, index) => ({
      index,
      fullName: contact.fullName.trim(),
      phone: contact.phone?.trim() || undefined,
      email: contact.email?.trim().toLowerCase() || undefined,
      tags: contact.tags?.map((tag) => tag.trim()).filter(Boolean) ?? []
    }));
    const emails = normalizedRows.map((row) => row.email).filter(Boolean) as string[];
    const phones = normalizedRows.map((row) => row.phone).filter(Boolean) as string[];
    const existingContacts = await this.prisma.contact.findMany({
      where: {
        organizationId,
        ...(emails.length || phones.length
          ? {
              OR: [
                emails.length ? { email: { in: emails } } : {},
                phones.length ? { phone: { in: phones } } : {}
              ].filter((item) => Object.keys(item).length)
            }
          : {})
      },
      select: { email: true, phone: true }
    });
    const seenEmails = new Set(existingContacts.map((contact) => contact.email).filter(Boolean));
    const seenPhones = new Set(existingContacts.map((contact) => contact.phone).filter(Boolean));
    const created = [];
    const skipped = [];

    for (const row of normalizedRows) {
      const duplicateEmail = row.email ? seenEmails.has(row.email) : false;
      const duplicatePhone = row.phone ? seenPhones.has(row.phone) : false;

      if (duplicateEmail || duplicatePhone) {
        skipped.push({
          row: row.index + 1,
          fullName: row.fullName,
          reason: duplicateEmail ? "duplicate_email" : "duplicate_phone"
        });
        continue;
      }

      const contact = await this.prisma.contact.create({
        data: {
          organizationId,
          fullName: row.fullName,
          phone: row.phone,
          email: row.email,
          tags: row.tags
        }
      });

      created.push(contact);
      if (row.email) {
        seenEmails.add(row.email);
      }
      if (row.phone) {
        seenPhones.add(row.phone);
      }
    }

    const result = {
      created: created.length,
      skipped: skipped.length,
      total: normalizedRows.length,
      skippedRows: skipped
    };

    await this.auditLogs.create({
      action: "contacts.imported",
      actorUserId,
      entityType: "contact",
      metadata: result,
      organizationId
    });

    return result;
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
