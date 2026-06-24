import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: {
        organizations: {
          include: { organization: true },
          where: { isActive: true }
        }
      }
    });

    if (!user || user.status !== "active") {
      throw new UnauthorizedException("Invalid credentials");
    }

    const validPassword = await bcrypt.compare(dto.password, user.passwordHash);
    if (!validPassword) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const activeMembership = user.organizations[0];
    const payload = {
      sub: user.id,
      email: user.email,
      organizationId: activeMembership?.organizationId,
      role: activeMembership?.role
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.config.get<string>("JWT_SECRET"),
      expiresIn: "8h"
    });

    return {
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        organizationId: activeMembership?.organizationId,
        organizationName: activeMembership?.organization.name,
        role: activeMembership?.role
      }
    };
  }
}
