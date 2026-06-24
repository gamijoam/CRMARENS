import { ForbiddenException } from "@nestjs/common";
import { AuthenticatedUser } from "./authenticated-user";

export function requireRole(user: AuthenticatedUser, allowedRoles: string[]) {
  if (!user.role || !allowedRoles.includes(user.role)) {
    throw new ForbiddenException("Insufficient permissions");
  }
}
