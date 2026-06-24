import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateOrganizationDto } from "./dto/create-organization.dto";

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateOrganizationDto) {
    return this.prisma.organization.create({
      data: {
        name: dto.name,
        timezone: dto.timezone ?? "America/Caracas"
      }
    });
  }

  async findOne(id: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id }
    });

    if (!organization) {
      throw new NotFoundException("Organization not found");
    }

    return organization;
  }

  users(organizationId: string) {
    return this.prisma.organizationUser.findMany({
      where: { organizationId, isActive: true },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            status: true,
            createdAt: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });
  }
}
