import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/** Batasi route ke role tertentu. Tanpa decorator = semua user terautentikasi. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
