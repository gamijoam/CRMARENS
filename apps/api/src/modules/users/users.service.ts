import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email }
    });

    if (existingUser) {
      throw new ConflictException("Email already exists");
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: dto.organizationId }
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
            organizationId: dto.organizationId,
            role: dto.role
          }
        }
      },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        organizations: true,
        createdAt: true
      }
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        organizations: true,
        createdAt: true
      }
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return user;
  }
}
