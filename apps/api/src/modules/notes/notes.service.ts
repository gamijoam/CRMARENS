import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { canViewTeamData } from "../../shared/access-policy";
import { AuthenticatedUser } from "../../shared/authenticated-user";
import { CreateNoteDto } from "./dto/create-note.dto";
import { ListNotesQueryDto } from "./dto/list-notes-query.dto";
import { UpdateNoteDto } from "./dto/update-note.dto";

@Injectable()
export class NotesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, userId: string, dto: CreateNoteDto) {
    await this.ensureTargetsBelongToOrganization(organizationId, dto.contactId, dto.leadId);

    return this.prisma.note.create({
      data: {
        organizationId,
        contactId: dto.contactId,
        leadId: dto.leadId,
        body: dto.body,
        createdByUserId: userId
      },
      include: this.noteInclude()
    });
  }

  findMany(organizationId: string, user: AuthenticatedUser, query: ListNotesQueryDto) {
    const where: Prisma.NoteWhereInput = {
      organizationId,
      contactId: query.contactId,
      leadId: query.leadId,
      ...(canViewTeamData(user)
        ? {}
        : {
            OR: [
              { createdByUserId: user.sub },
              { lead: { assignedUserId: user.sub } }
            ]
          })
    };

    return this.prisma.note.findMany({
      where,
      include: this.noteInclude(),
      orderBy: { createdAt: "desc" },
      take: 100
    });
  }

  async findOne(organizationId: string, user: AuthenticatedUser, id: string) {
    const note = await this.prisma.note.findFirst({
      where: {
        id,
        organizationId,
        ...(canViewTeamData(user)
          ? {}
          : {
              OR: [
                { createdByUserId: user.sub },
                { lead: { assignedUserId: user.sub } }
              ]
            })
      },
      include: this.noteInclude()
    });

    if (!note) {
      throw new NotFoundException("Note not found");
    }

    return note;
  }

  async update(organizationId: string, user: AuthenticatedUser, id: string, dto: UpdateNoteDto) {
    await this.findOne(organizationId, user, id);

    return this.prisma.note.update({
      where: { id },
      data: { body: dto.body },
      include: this.noteInclude()
    });
  }

  async remove(organizationId: string, user: AuthenticatedUser, id: string) {
    await this.findOne(organizationId, user, id);
    await this.prisma.note.delete({ where: { id } });
    return { deleted: true };
  }

  private noteInclude() {
    return {
      contact: true,
      lead: {
        include: {
          pipeline: true,
          stage: true
        }
      },
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    } satisfies Prisma.NoteInclude;
  }

  private async ensureTargetsBelongToOrganization(
    organizationId: string,
    contactId?: string,
    leadId?: string
  ) {
    if (contactId) {
      const contact = await this.prisma.contact.findFirst({
        where: { id: contactId, organizationId },
        select: { id: true }
      });

      if (!contact) {
        throw new NotFoundException("Contact not found");
      }
    }

    if (leadId) {
      const lead = await this.prisma.lead.findFirst({
        where: { id: leadId, organizationId },
        select: { id: true }
      });

      if (!lead) {
        throw new NotFoundException("Lead not found");
      }
    }
  }
}
