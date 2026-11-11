import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ActivityType, Prisma, ProjectStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateProjectDto } from './dto/create-project.dto.js';
import type { QueryProjectsDto } from './dto/query-projects.dto.js';
import type { UpdateProjectDto } from './dto/update-project.dto.js';
import {
  mapProjectDetail,
  mapProjectSummary,
  projectDetailInclude,
  projectListInclude,
} from './project.mapper.js';
import { SDLC_STAGE_TITLES } from './sdlc-stages.js';

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

  async create(dto: CreateProjectDto, actor: AuthenticatedUser) {
    if (!dto.client_id && !dto.client) {
      throw new BadRequestException(
        'Pilih klien yang sudah ada atau isi data klien baru.',
      );
    }
    if (dto.client_id && dto.client) {
      throw new BadRequestException(
        'Pilih salah satu: klien yang sudah ada atau klien baru.',
      );
    }

    const name = dto.name.trim();
    const startDate = dto.start_date ? parseDateOnly(dto.start_date) : null;
    const dueDate = dto.due_date ? parseDateOnly(dto.due_date) : null;
    if (startDate && dueDate && dueDate < startDate) {
      throw new BadRequestException(
        'Tenggat tidak boleh sebelum tanggal mulai.',
      );
    }

    const project = await this.prisma.$transaction(async (tx) => {
      let clientId: string;

      if (dto.client_id) {
        const client = await tx.client.findUnique({
          where: { id: dto.client_id },
          select: { id: true },
        });
        if (!client) throw new BadRequestException('Klien tidak ditemukan.');
        clientId = client.id;
      } else {
        const client = await tx.client.create({
          data: {
            name: dto.client!.name.trim(),
            address: dto.client!.address.trim(),
            contactName: dto.client!.contact_name.trim(),
            contactRole: dto.client!.contact_role.trim(),
            phone: dto.client!.phone.trim(),
          },
        });
        clientId = client.id;
      }

      const code = await nextProjectCode(tx);
      const created = await tx.project.create({
        data: {
          code,
          name,
          clientId,
          startDate,
          dueDate,
          status: 'not_started',
          currentStage: 0,
          stages: {
            create: SDLC_STAGE_TITLES.map((title, index) => ({
              stageNo: index + 1,
              title,
            })),
          },
        },
        include: projectDetailInclude,
      });

      await tx.activity.create({
        data: {
          projectId: created.id,
          actorId: actor.id,
          type: 'project_created',
          division: actor.division ?? 'Internal',
          action: 'membuat proyek',
          target: name,
        },
      });

      return created;
    });

    return mapProjectDetail(project);
  }

  async updateProject(
    code: string,
    dto: UpdateProjectDto,
    actor: AuthenticatedUser,
  ) {
    const project = await this.prisma.project.findUnique({ where: { code } });
    if (!project) throw new NotFoundException('Proyek tidak ditemukan.');

    const data: Prisma.ProjectUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.current_stage !== undefined) {
      data.currentStage = dto.current_stage;
    }
    if (dto.start_date !== undefined) {
      data.startDate = dto.start_date ? parseDateOnly(dto.start_date) : null;
    }
    if (dto.due_date !== undefined) {
      data.dueDate = dto.due_date ? parseDateOnly(dto.due_date) : null;
    }

    const nextStart =
      dto.start_date === undefined
        ? project.startDate
        : dto.start_date
          ? parseDateOnly(dto.start_date)
          : null;
    const nextDue =
      dto.due_date === undefined
        ? project.dueDate
        : dto.due_date
          ? parseDateOnly(dto.due_date)
          : null;
    if (nextStart && nextDue && nextDue < nextStart) {
      throw new BadRequestException(
        'Tenggat tidak boleh sebelum tanggal mulai.',
      );
    }

    if (Object.keys(data).length === 0 && !dto.client) {
      throw new BadRequestException('Tidak ada field yang diubah.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.client) {
        await tx.client.update({
          where: { id: project.clientId },
          data: {
            name: dto.client.name.trim(),
            address: dto.client.address.trim(),
            contactName: dto.client.contact_name.trim(),
            contactRole: dto.client.contact_role.trim(),
            phone: dto.client.phone.trim(),
          },
        });
      }

      // Pastikan updated_at ikut berubah saat hanya data klien yang diubah.
      if (Object.keys(data).length === 0) data.updatedAt = new Date();

      return tx.project.update({
        where: { code },
        data,
        include: projectListInclude,
      });
    });

    await this.createActivity({
      projectId: project.id,
      actor,
      type: 'project_updated',
      action: 'memperbarui proyek',
      target: updated.name,
    });

    return mapProjectSummary(updated);
  }

  async updateStage(
    code: string,
    stageNo: number,
    isCompleted: boolean,
    actor: AuthenticatedUser,
  ) {
    const stage = await this.prisma.projectStage.findFirst({
      where: { stageNo, project: { code } },
      include: { project: true },
    });

    if (!stage) {
      throw new NotFoundException('Proyek atau tahap tidak ditemukan.');
    }

    const updatedStage = await this.prisma.projectStage.update({
      where: { id: stage.id },
      data: {
        isCompleted,
        completedAt: isCompleted ? new Date() : null,
      },
    });

    const stages = await this.prisma.projectStage.findMany({
      where: { projectId: stage.projectId },
      orderBy: { stageNo: 'asc' },
    });

    const completedStages = stages.filter((item) => item.isCompleted).length;
    const nextStage = stages.find((item) => !item.isCompleted);

    let currentStage = nextStage?.stageNo ?? stages.length;
    if (completedStages === 0 && stage.project.status === 'not_started') {
      currentStage = 0;
    }

    let status: ProjectStatus = stage.project.status;
    if (isCompleted) {
      if (completedStages === stages.length) {
        status = 'completed';
      } else if (status === 'not_started') {
        status = 'in_progress';
      }
    } else {
      status = 'in_progress';
    }

    await this.prisma.project.update({
      where: { id: stage.projectId },
      data: { currentStage, status },
    });

    await this.createActivity({
      projectId: stage.projectId,
      actor,
      type: isCompleted ? 'stage_completed' : 'stage_reopened',
      action: isCompleted ? 'menyelesaikan tahap' : 'membuka kembali tahap',
      target: updatedStage.title,
    });

    const documentCount = await this.prisma.document.count({
      where: { stageId: updatedStage.id, deletedAt: null },
    });

    return {
      stage_no: updatedStage.stageNo,
      title: updatedStage.title,
      is_completed: updatedStage.isCompleted,
      completed_at: updatedStage.completedAt?.toISOString() ?? null,
      document_count: documentCount,
    };
  }

  private async createActivity(input: {
    projectId: string;
    actor: AuthenticatedUser;
    type: ActivityType;
    action: string;
    target: string;
  }): Promise<void> {
    await this.prisma.activity.create({
      data: {
        projectId: input.projectId,
        actorId: input.actor.id,
        type: input.type,
        division: input.actor.division ?? 'Internal',
        action: input.action,
        target: input.target,
      },
    });
  }
}

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

async function nextProjectCode(tx: Prisma.TransactionClient): Promise<string> {
  const last = await tx.project.findFirst({
    where: { code: { startsWith: 'PRJ-' } },
    orderBy: { code: 'desc' },
    select: { code: true },
  });
  const lastNumber = last ? Number.parseInt(last.code.slice(4), 10) : 0;
  const next = Number.isFinite(lastNumber) ? lastNumber + 1 : 1;
  return `PRJ-${String(next).padStart(3, '0')}`;
}
