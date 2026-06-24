import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreatePipelineDto } from "./dto/create-pipeline.dto";
import { ReorderPipelineStagesDto } from "./dto/reorder-pipeline-stages.dto";

const defaultStages = ["Nuevo", "Contactado", "Interesado", "Negociacion", "Ganado", "Perdido"];

@Injectable()
export class PipelinesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, dto: CreatePipelineDto) {
    const existing = await this.prisma.pipeline.findUnique({
      where: {
        organizationId_name: {
          organizationId,
          name: dto.name
        }
      },
      select: { id: true }
    });

    if (existing) {
      throw new ConflictException("Pipeline name already exists");
    }

    const stages = dto.stages?.length ? dto.stages.map((stage) => stage.name) : defaultStages;

    return this.prisma.pipeline.create({
      data: {
        organizationId,
        name: dto.name,
        stages: {
          create: stages.map((name, position) => ({
            name,
            position
          }))
        }
      },
      include: {
        stages: {
          orderBy: { position: "asc" }
        }
      }
    });
  }

  findMany(organizationId: string) {
    return this.prisma.pipeline.findMany({
      where: { organizationId },
      include: {
        stages: {
          orderBy: { position: "asc" }
        },
        _count: {
          select: { leads: true }
        }
      },
      orderBy: { createdAt: "asc" }
    });
  }

  async findOne(organizationId: string, id: string) {
    const pipeline = await this.prisma.pipeline.findFirst({
      where: { id, organizationId },
      include: {
        stages: {
          orderBy: { position: "asc" }
        },
        _count: {
          select: { leads: true }
        }
      }
    });

    if (!pipeline) {
      throw new NotFoundException("Pipeline not found");
    }

    return pipeline;
  }

  async reorderStages(organizationId: string, id: string, dto: ReorderPipelineStagesDto) {
    const pipeline = await this.findOne(organizationId, id);
    const currentStageIds = new Set(pipeline.stages.map((stage) => stage.id));
    const requestedStageIds = new Set(dto.stageIds);

    if (
      currentStageIds.size !== requestedStageIds.size ||
      dto.stageIds.some((stageId) => !currentStageIds.has(stageId))
    ) {
      throw new NotFoundException("Pipeline stage not found");
    }

    await this.prisma.$transaction(async (tx) => {
      for (const [index, stageId] of dto.stageIds.entries()) {
        await tx.pipelineStage.update({
          where: { id: stageId },
          data: { position: -(index + 1) }
        });
      }

      for (const [position, stageId] of dto.stageIds.entries()) {
        await tx.pipelineStage.update({
          where: { id: stageId },
          data: { position }
        });
      }
    });

    return this.findOne(organizationId, id);
  }
}
