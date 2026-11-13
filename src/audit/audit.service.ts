import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { QueryAuditLogsDto } from './dto/query-audit-logs.dto.js';
import { toAuditLogResponse } from './audit.mapper.js';

export interface AuditEntry {
  actor: AuthenticatedUser;
  action: string;
  entity: 'user' | 'project';
  entityId?: string | null;
  summary: string;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /// Pencatatan audit bersifat best-effort: kegagalan audit tidak boleh
  /// menggagalkan aksi utama yang sudah berhasil.
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: entry.actor.id,
          actorName: entry.actor.name,
          actorRole: entry.actor.role,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId ?? null,
          summary: entry.summary,
          metadata: entry.metadata,
        },
      });
    } catch (error) {
      this.logger.warn(`Gagal mencatat audit: ${String(error)}`);
    }
  }

  async list(query: QueryAuditLogsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.AuditLogWhereInput = {};
    if (query.entity) where.entity = query.entity;
    if (query.action) where.action = query.action;
    if (query.search) {
      where.OR = [
        { summary: { contains: query.search, mode: 'insensitive' } },
        { actorName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: rows.map(toAuditLogResponse),
      meta: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }
}
