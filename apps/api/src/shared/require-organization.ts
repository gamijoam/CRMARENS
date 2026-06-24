import { ForbiddenException } from "@nestjs/common";
import { AuthenticatedUser } from "./authenticated-user";

export function requireOrganization(user: AuthenticatedUser) {
  if (!user.organizationId) {
    throw new ForbiddenException("Active organization is required");
  }

  return user.organizationId;
}
