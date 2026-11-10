import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  activityCursorWhere,
  activityInclude,
  decodeActivityCursor,
  encodeActivityCursor,
  mapActivity,
} from './activity.mapper.js';
import type { QueryActivitiesDto } from './dto/query-activities.dto.js';

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: QueryActivitiesDto) {
    const limit = query.limit ?? 20;
    const where: Prisma.ActivityWhereInput = {};

    if (query.cursor) {
      try {
        Object.assign(where, activityCursorWhere(decodeActivityCursor(query.cursor)));
      } catch {
        throw new BadRequestException('Cursor tidak valid.');
      }
    }

    const rows = await this.prisma.activity.findMany({
      where,
      include: activityInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit);
    const nextCursor =
      hasMore && data.length > 0
        ? encodeActivityCursor(data[data.length - 1])
        : null;

    return {
      data: data.map(mapActivity),
      next_cursor: nextCursor,
    };
  }
}
