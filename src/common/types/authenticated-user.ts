import type { UserRole } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  division: string | null;
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
}
