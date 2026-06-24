import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../prisma/prisma.service";
import { canViewTeamData } from "../../shared/access-policy";
import { AuthenticatedUser } from "../../shared/authenticated-user";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { CreateUserDto } from "./dto/create-user.dto";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService
  ) {}

  async create(organizationId: string, actorUserId: string, dto: CreateUserDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email }
    });

    if (existingUser) {
      throw new ConflictException("Email already exists");
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId }
    });

    if (!organization) {
      throw new NotFoundException("Organization not found");
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash,
        organizations: {
          create: {
            organizationId,
            role: dto.role
          }
        }
      },
      select: this.userSelect(organizationId)
    });

    await this.auditLogs.create({
      action: "user.created",
      actorUserId,
      entityId: user.id,
      entityType: "user",
      metadata: { email: user.email, role: user.organizations[0]?.role },
      organizationId
    });

    return user;
  }

  findMany(organizationId: string, user: AuthenticatedUser) {
    return this.prisma.user.findMany({
      where: {
        id: canViewTeamData(user) ? undefined : user.sub,
        organizations: {
          some: {
            organizationId,
            isActive: true
          }
        }
      },
      orderBy: { createdAt: "asc" },
      select: this.userSelect(organizationId)
    });
  }

  async findOne(organizationId: string, id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: this.userSelect(organizationId)
    });

    if (!user || !user.organizations.length) {
      throw new NotFoundException("User not found");
    }

    return user;
  }

  private userSelect(organizationId?: string) {
    return {
      id: true,
      name: true,
      email: true,
      status: true,
      createdAt: true,
      organizations: {
        where: organizationId ? { organizationId } : undefined,
        select: {
          organizationId: true,
          role: true,
          isActive: true,
          createdAt: true,
          organization: {
            select: {
              id: true,
              name: true
            }
          }
        }
      }
    } satisfies Prisma.UserSelect;
  }
}
