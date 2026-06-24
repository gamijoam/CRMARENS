import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, dto: CreateUserDto) {
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

    return this.prisma.user.create({
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
  }

  findMany(organizationId: string) {
    return this.prisma.user.findMany({
      where: {
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
