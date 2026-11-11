import type { User, UserRole } from '@prisma/client';

export interface UserResponse {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  division: string | null;
  is_active: boolean;
  created_at: string;
}

export function toUserResponse(user: User): UserResponse {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    division: user.division,
    is_active: user.isActive,
    created_at: user.createdAt.toISOString(),
  };
}
