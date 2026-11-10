import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHmac, randomBytes } from 'node:crypto';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: User['role'];
  division: string | null;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
  user: PublicUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(email: string, password: string): Promise<AuthTokens> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Email atau password salah.');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Email atau password salah.');
    }

    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const tokenHash = this.hashRefreshToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (
      !stored ||
      stored.revokedAt ||
      stored.expiresAt <= new Date() ||
      !stored.user.isActive
    ) {
      throw new UnauthorizedException('Refresh token tidak valid.');
    }

    const revoked = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (revoked.count !== 1) {
      throw new UnauthorizedException('Refresh token tidak valid.');
    }

    return this.issueTokens(stored.user);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: {
        tokenHash: this.hashRefreshToken(refreshToken),
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  async me(user: AuthenticatedUser): Promise<PublicUser> {
    const current = await this.prisma.user.findUnique({
      where: { id: user.id },
    });

    if (!current || !current.isActive) {
      throw new UnauthorizedException(
        'Sesi berakhir, silakan login kembali.',
      );
    }

    return this.toPublicUser(current);
  }

  private async issueTokens(user: User): Promise<AuthTokens> {
    const accessTtl = this.config.get<number>('JWT_ACCESS_TTL') ?? 900;
    const refreshTtl = this.config.get<number>('JWT_REFRESH_TTL') ?? 604800;

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role },
      { expiresIn: accessTtl },
    );

    const refreshToken = `rft_${randomBytes(32).toString('base64url')}`;
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashRefreshToken(refreshToken),
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
      },
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: accessTtl,
      user: this.toPublicUser(user),
    };
  }

  private hashRefreshToken(token: string): string {
    return createHmac(
      'sha256',
      this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
    )
      .update(token)
      .digest('hex');
  }

  private toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      division: user.division,
    };
  }
}
