export interface AuthenticatedUser {
  sub: string;
  email: string;
  organizationId?: string;
  role?: string;
}
