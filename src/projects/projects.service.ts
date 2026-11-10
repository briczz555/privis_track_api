import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { QueryProjectsDto } from './dto/query-projects.dto.js';
import {
  mapProjectDetail,
  mapProjectSummary,
  projectDetailInclude,
  projectListInclude,
} from './project.mapper.js';

const PROJECT_CODE_PATTERN = /^PRJ-[0-9]{3}$/;

function resolveOrderBy(
  sort?: string,
): Prisma.ProjectOrderByWithRelationInput[] {
  switch (sort) {
    case 'due_date:asc':
      return [{ dueDate: 'asc' }, { id: 'desc' }];
    case 'due_date:desc':
      return [{ dueDate: 'desc' }, { id: 'desc' }];
    case 'code:asc':
      return [{ code: 'asc' }, { id: 'desc' }];
    case 'updated_at:asc':
      return [{ updatedAt: 'asc' }, { id: 'desc' }];
    default:
      return [{ updatedAt: 'desc' }, { id: 'desc' }];
  }
}

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: QueryProjectsDto) {
    const where: Prisma.ProjectWhereInput = {};

    if (query.status) where.status = query.status;
    if (query.client_id) where.clientId = query.client_id;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        include: projectListInclude,
        orderBy: resolveOrderBy(query.sort),
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.project.count({ where }),
    ]);

    return {
      data: rows.map(mapProjectSummary),
      meta: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  async detail(code: string) {
    if (!PROJECT_CODE_PATTERN.test(code)) {
      throw new NotFoundException('Proyek tidak ditemukan.');
    }

    const project = await this.prisma.project.findUnique({
      where: { code },
      include: projectDetailInclude,
    });

    if (!project) {
      throw new NotFoundException('Proyek tidak ditemukan.');
    }

    return mapProjectDetail(project);
  }
}
