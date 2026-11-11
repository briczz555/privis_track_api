import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateUserDto } from './dto/create-user.dto.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';
import { toUserResponse, type UserResponse } from './user.mapper.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<{ data: UserResponse[] }> {
    const users = await this.prisma.user.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });

    return { data: users.map(toUserResponse) };
  }

  async create(dto: CreateUserDto): Promise<UserResponse> {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });

    if (existing) {
      throw new ConflictException('Email sudah dipakai.');
    }

    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email,
        passwordHash: await bcrypt.hash(dto.password, 10),
        role: dto.role,
        division: dto.division?.trim() || null,
      },
    });

    return toUserResponse(user);
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    actor: AuthenticatedUser,
  ): Promise<UserResponse> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User tidak ditemukan.');

    const isSelf = user.id === actor.id;

    if (isSelf && dto.is_active === false) {
      throw new BadRequestException('Tidak bisa menonaktifkan akun sendiri.');
    }
    if (isSelf && dto.role !== undefined && dto.role !== user.role) {
      throw new BadRequestException('Tidak bisa mengubah role akun sendiri.');
    }

    const losesActiveAdmin =
      user.role === 'admin' &&
      user.isActive &&
      ((dto.role !== undefined && dto.role !== 'admin') ||
        dto.is_active === false);

    if (losesActiveAdmin) {
      const activeAdmins = await this.prisma.user.count({
        where: { role: 'admin', isActive: true },
      });
      if (activeAdmins <= 1) {
        throw new BadRequestException('Minimal harus ada satu admin aktif.');
      }
    }

    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.division !== undefined)
      data.division = dto.division?.trim() || null;
    if (dto.is_active !== undefined) data.isActive = dto.is_active;

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Tidak ada field yang diubah.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.user.update({ where: { id }, data });

      // Nonaktifkan semua sesi user agar tidak bisa lanjut memakai refresh token.
      if (dto.is_active === false) {
        await tx.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      return result;
    });

    return toUserResponse(updated);
  }

  async resetPassword(
    id: string,
    newPassword: string,
    actor: AuthenticatedUser,
  ): Promise<void> {
    if (id === actor.id) {
      throw new BadRequestException(
        'Gunakan menu ganti password untuk akun sendiri.',
      );
    }

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User tidak ditemukan.');

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { passwordHash } });
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }
}
