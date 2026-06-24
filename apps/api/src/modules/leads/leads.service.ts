import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { canViewTeamData, ensureCanAssignTo, scopedAssignedUserId } from "../../shared/access-policy";
import { AuthenticatedUser } from "../../shared/authenticated-user";
import { AssignLeadDto } from "./dto/assign-lead.dto";
import { CreateLeadDto } from "./dto/create-lead.dto";
import { ListLeadsQueryDto } from "./dto/list-leads-query.dto";
import { MoveLeadStageDto } from "./dto/move-lead-stage.dto";
import { UpdateLeadStatusDto } from "./dto/update-lead-status.dto";

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, user: AuthenticatedUser, dto: CreateLeadDto) {
    await this.ensureContactExists(organizationId, dto.contactId);
    ensureCanAssignTo(user, dto.assignedUserId);

    const pipeline = dto.pipelineId
      ? await this.ensurePipelineExists(organizationId, dto.pipelineId)
      : await this.getDefaultPipeline(organizationId);

    const stage = dto.stageId
      ? await this.ensureStageExists(pipeline.id, dto.stageId)
      : await this.getFirstStage(pipeline.id);

    if (dto.assignedUserId) {
      await this.ensureOrganizationUserExists(organizationId, dto.assignedUserId);
    }

    const assignedUserId = dto.assignedUserId ?? (!canViewTeamData(user) ? user.sub : undefined);

    return this.prisma.lead.create({
      data: {
        organizationId,
        contactId: dto.contactId,
        pipelineId: pipeline.id,
        stageId: stage.id,
        value: dto.value,
        currency: dto.currency ?? "USD",
        assignedUserId
      },
      include: this.leadInclude()
    });
  }

  findMany(organizationId: string, user: AuthenticatedUser, query: ListLeadsQueryDto) {
    const where: Prisma.LeadWhereInput = {
      organizationId,
      pipelineId: query.pipelineId,
      stageId: query.stageId,
      status: query.status,
      assignedUserId: scopedAssignedUserId(user, query.assignedUserId)
    };

    return this.prisma.lead.findMany({
      where,
      include: this.leadInclude(),
      orderBy: { createdAt: "desc" },
      take: 100
    });
  }

  async findOne(organizationId: string, user: AuthenticatedUser, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: {
        id,
        organizationId,
        ...(canViewTeamData(user) ? {} : { assignedUserId: user.sub })
      },
      include: this.leadInclude()
    });

    if (!lead) {
      throw new NotFoundException("Lead not found");
    }

    return lead;
  }

  async moveStage(organizationId: string, user: AuthenticatedUser, id: string, dto: MoveLeadStageDto) {
    const lead = await this.findOne(organizationId, user, id);
    await this.ensureStageExists(lead.pipelineId, dto.stageId);

    return this.prisma.lead.update({
      where: { id },
      data: { stageId: dto.stageId },
      include: this.leadInclude()
    });
  }

  async updateStatus(organizationId: string, user: AuthenticatedUser, id: string, dto: UpdateLeadStatusDto) {
    await this.findOne(organizationId, user, id);

    return this.prisma.lead.update({
      where: { id },
      data: { status: dto.status },
      include: this.leadInclude()
    });
  }

  async assign(organizationId: string, user: AuthenticatedUser, id: string, dto: AssignLeadDto) {
    await this.findOne(organizationId, user, id);
    ensureCanAssignTo(user, dto.assignedUserId);
    if (dto.assignedUserId) {
      await this.ensureOrganizationUserExists(organizationId, dto.assignedUserId);
    }

    return this.prisma.lead.update({
      where: { id },
      data: { assignedUserId: dto.assignedUserId ?? null },
      include: this.leadInclude()
    });
  }

  private leadInclude() {
    return {
      contact: {
        include: { channels: true }
      },
      pipeline: true,
      stage: true,
      assignee: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    } satisfies Prisma.LeadInclude;
  }

  private async ensureContactExists(organizationId: string, contactId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, organizationId },
      select: { id: true }
    });

    if (!contact) {
      throw new NotFoundException("Contact not found");
    }

    return contact;
  }

  private async ensurePipelineExists(organizationId: string, pipelineId: string) {
    const pipeline = await this.prisma.pipeline.findFirst({
      where: { id: pipelineId, organizationId },
      select: { id: true }
    });

    if (!pipeline) {
      throw new NotFoundException("Pipeline not found");
    }

    return pipeline;
  }

  private async getDefaultPipeline(organizationId: string) {
    const pipeline = await this.prisma.pipeline.findFirst({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
      select: { id: true }
    });

    if (!pipeline) {
      throw new NotFoundException("Pipeline not found");
    }

    return pipeline;
  }

  private async ensureStageExists(pipelineId: string, stageId: string) {
    const stage = await this.prisma.pipelineStage.findFirst({
      where: { id: stageId, pipelineId },
      select: { id: true }
    });

    if (!stage) {
      throw new NotFoundException("Pipeline stage not found");
    }

    return stage;
  }

  private async getFirstStage(pipelineId: string) {
    const stage = await this.prisma.pipelineStage.findFirst({
      where: { pipelineId },
      orderBy: { position: "asc" },
      select: { id: true }
    });

    if (!stage) {
      throw new NotFoundException("Pipeline stage not found");
    }

    return stage;
  }

  private async ensureOrganizationUserExists(organizationId: string, userId: string) {
    const organizationUser = await this.prisma.organizationUser.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId
        }
      },
      select: { userId: true }
    });

    if (!organizationUser) {
      throw new NotFoundException("Assigned user not found");
    }

    return organizationUser;
  }
}
