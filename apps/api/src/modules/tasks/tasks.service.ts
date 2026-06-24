import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AssignTaskDto } from "./dto/assign-task.dto";
import { CreateTaskDto } from "./dto/create-task.dto";
import { ListTasksQueryDto } from "./dto/list-tasks-query.dto";
import { UpdateTaskStatusDto } from "./dto/update-task-status.dto";
import { UpdateTaskDto } from "./dto/update-task.dto";

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, userId: string, dto: CreateTaskDto) {
    await this.ensureTargetsBelongToOrganization(organizationId, dto.contactId, dto.leadId);
    if (dto.assignedUserId) {
      await this.ensureOrganizationUserExists(organizationId, dto.assignedUserId);
    }

    return this.prisma.task.create({
      data: {
        organizationId,
        contactId: dto.contactId,
        leadId: dto.leadId,
        title: dto.title,
        description: dto.description,
        dueAt: dto.dueAt,
        assignedUserId: dto.assignedUserId,
        createdByUserId: userId
      },
      include: this.taskInclude()
    });
  }

  findMany(organizationId: string, query: ListTasksQueryDto) {
    const where: Prisma.TaskWhereInput = {
      organizationId,
      contactId: query.contactId,
      leadId: query.leadId,
      assignedUserId: query.assignedUserId,
      status: query.status
    };

    return this.prisma.task.findMany({
      where,
      include: this.taskInclude(),
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      take: 100
    });
  }

  async findOne(organizationId: string, id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, organizationId },
      include: this.taskInclude()
    });

    if (!task) {
      throw new NotFoundException("Task not found");
    }

    return task;
  }

  async update(organizationId: string, id: string, dto: UpdateTaskDto) {
    await this.findOne(organizationId, id);
    if (dto.assignedUserId) {
      await this.ensureOrganizationUserExists(organizationId, dto.assignedUserId);
    }

    return this.prisma.task.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        dueAt: dto.dueAt,
        assignedUserId: dto.assignedUserId
      },
      include: this.taskInclude()
    });
  }

  async updateStatus(organizationId: string, id: string, dto: UpdateTaskStatusDto) {
    await this.findOne(organizationId, id);

    return this.prisma.task.update({
      where: { id },
      data: { status: dto.status },
      include: this.taskInclude()
    });
  }

  async assign(organizationId: string, id: string, dto: AssignTaskDto) {
    await this.findOne(organizationId, id);
    if (dto.assignedUserId) {
      await this.ensureOrganizationUserExists(organizationId, dto.assignedUserId);
    }

    return this.prisma.task.update({
      where: { id },
      data: { assignedUserId: dto.assignedUserId ?? null },
      include: this.taskInclude()
    });
  }

  private taskInclude() {
    return {
      contact: true,
      lead: {
        include: {
          pipeline: true,
          stage: true
        }
      },
      assignee: {
        select: {
          id: true,
          name: true,
          email: true
        }
      },
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    } satisfies Prisma.TaskInclude;
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
