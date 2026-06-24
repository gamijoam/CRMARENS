import { ForbiddenException } from "@nestjs/common";
import { AuthenticatedUser } from "./authenticated-user";

export const TEAM_VIEW_ROLES = ["owner", "admin", "supervisor"];

export function canViewTeamData(user: AuthenticatedUser) {
  return Boolean(user.role && TEAM_VIEW_ROLES.includes(user.role));
}

export function ensureCanAssignTo(user: AuthenticatedUser, assignedUserId?: string) {
  if (!assignedUserId || canViewTeamData(user) || assignedUserId === user.sub) {
    return;
  }

  throw new ForbiddenException("You can only assign records to yourself");
}

export function scopedAssignedUserId(user: AuthenticatedUser, requestedAssignedUserId?: string) {
  return canViewTeamData(user) ? requestedAssignedUserId : user.sub;
}
