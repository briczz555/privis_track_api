import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { S3Service } from '../storage/s3.service.js';
import type { CreateMeetingDto } from './dto/create-meeting.dto.js';
import type { QueryMeetingsDto } from './dto/query-meetings.dto.js';
import type { UpdateMeetingDto } from './dto/update-meeting.dto.js';
import { meetingInclude, toMeetingResponse } from './meeting.mapper.js';
import { fillMomDocument, loadMomTemplate } from './mom/mom-document.js';
import {
  buildMomFields,
  buildMomFileName,
  DOCX_MIME_TYPE,
} from './mom/mom-fields.js';

const MAX_RANGE_MS = 92 * 24 * 60 * 60 * 1000;
const MAX_DURATION_MS = 24 * 60 * 60 * 1000;

const projectSelect = {
  id: true,
  code: true,
  name: true,
  client: { select: { id: true, name: true, address: true } },
} satisfies Prisma.ProjectSelect;

@Injectable()
export class MeetingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly s3: S3Service,
  ) {}

  async list(query: QueryMeetingsDto, user: AuthenticatedUser) {
    const from = parseDate(query.from, 'from');
    const to = parseDate(query.to, 'to');

    if (to <= from) {
      throw new BadRequestException('Rentang tanggal tidak valid.');
    }
    if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
      throw new UnprocessableEntityException(
        'Rentang tanggal maksimal 92 hari.',
      );
    }

    const where: Prisma.MeetingWhereInput = {
      startAt: { gte: from, lt: to },
    };
    if (query.project_code) {
      where.project = { code: query.project_code };
    }
    if (query.scope === 'mine') {
      where.OR = [
        { organizerId: user.id },
        { participants: { some: { userId: user.id } } },
      ];
    }

    const rows = await this.prisma.meeting.findMany({
      where,
      include: meetingInclude,
      orderBy: { startAt: 'asc' },
      take: 500,
    });

    return { data: rows.map(toMeetingResponse) };
  }

  async detail(id: string) {
    return toMeetingResponse(await this.findMeeting(id));
  }

  async create(dto: CreateMeetingDto, actor: AuthenticatedUser) {
    const start = parseDate(dto.start_at, 'start_at');
    const end = parseDate(dto.end_at, 'end_at');
    assertTimes(start, end);
    assertTitle(dto.title);

    const project = await this.findProject(dto.project_code);
    const participants = await this.resolveParticipants(
      dto.participant_ids,
      actor.id,
    );
    const placement = this.resolvePlacement(
      dto.mode,
      dto.meeting_url,
      dto.location,
      project?.client.address,
    );

    const meeting = await this.prisma.meeting.create({
      data: {
        title: dto.title.trim(),
        agenda: dto.agenda?.trim() || null,
        mode: dto.mode,
        startAt: start,
        endAt: end,
        meetingUrl: placement.meetingUrl,
        location: placement.location,
        notes: dto.notes?.trim() || null,
        projectId: project?.id ?? null,
        organizerId: actor.id,
        participants: {
          create: participants.map((userId) => ({ userId })),
        },
      },
      include: meetingInclude,
    });

    await this.audit.record({
      actor,
      action: 'meeting.created',
      entity: 'meeting',
      entityId: meeting.id,
      summary: `membuat meeting "${meeting.title}"`,
      metadata: {
        mode: meeting.mode,
        project_code: project?.code ?? null,
        participants: participants.length,
      },
    });

    return toMeetingResponse(meeting);
  }

  async update(id: string, dto: UpdateMeetingDto, actor: AuthenticatedUser) {
    const current = await this.findMeeting(id);
    assertCanManage(actor, current.organizerId);

    if (current.status === 'cancelled') {
      throw new BadRequestException(
        'Meeting yang dibatalkan tidak dapat diedit.',
      );
    }

    const start = dto.start_at
      ? parseDate(dto.start_at, 'start_at')
      : current.startAt;
    const end = dto.end_at ? parseDate(dto.end_at, 'end_at') : current.endAt;
    assertTimes(start, end);
    if (dto.title !== undefined) assertTitle(dto.title);

    const mode = dto.mode ?? current.mode;
    const project =
      dto.project_code === undefined
        ? await this.findProjectById(current.projectId)
        : await this.findProject(dto.project_code);

    const placement = this.resolvePlacement(
      mode,
      dto.meeting_url !== undefined ? dto.meeting_url : current.meetingUrl,
      dto.location !== undefined ? dto.location : current.location,
      project?.client.address,
    );

    const participants =
      dto.participant_ids === undefined
        ? null
        : await this.resolveParticipants(
            dto.participant_ids,
            current.organizerId,
          );

    const data: Prisma.MeetingUpdateInput = {
      title:
        dto.title !== undefined ? dto.title?.trim() || undefined : undefined,
      agenda:
        dto.agenda !== undefined ? dto.agenda?.trim() || null : undefined,
      mode,
      startAt: start,
      endAt: end,
      meetingUrl: placement.meetingUrl,
      location: placement.location,
      notes: dto.notes !== undefined ? dto.notes?.trim() || null : undefined,
    };
    if (dto.project_code !== undefined) {
      data.project = project
        ? { connect: { id: project.id } }
        : { disconnect: true };
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (participants) {
        await tx.meetingParticipant.deleteMany({ where: { meetingId: id } });
        await tx.meetingParticipant.createMany({
          data: participants.map((userId) => ({ meetingId: id, userId })),
        });
      }

      return tx.meeting.update({
        where: { id },
        data,
        include: meetingInclude,
      });
    });

    await this.audit.record({
      actor,
      action: 'meeting.updated',
      entity: 'meeting',
      entityId: updated.id,
      summary: `memperbarui meeting "${updated.title}"`,
      metadata: { fields: Object.keys(dto) },
    });

    return toMeetingResponse(updated);
  }

  async cancel(id: string, actor: AuthenticatedUser) {
    const current = await this.findMeeting(id);
    assertCanManage(actor, current.organizerId);

    if (current.status === 'cancelled') {
      return toMeetingResponse(current);
    }

    const updated = await this.prisma.meeting.update({
      where: { id },
      data: { status: 'cancelled' },
      include: meetingInclude,
    });

    await this.audit.record({
      actor,
      action: 'meeting.cancelled',
      entity: 'meeting',
      entityId: updated.id,
      summary: `membatalkan meeting "${updated.title}"`,
    });

    return toMeetingResponse(updated);
  }

  /**
   * Membuat atau membuat ulang MoM. Hanya Bagian 1 template yang terisi
   * otomatis; sisanya diisi manual setelah dokumen diunduh.
   */
  async generateMom(id: string, actor: AuthenticatedUser) {
    const meeting = await this.findMeeting(id);
    assertCanManageMom(actor, meeting.organizerId);

    if (meeting.status === 'cancelled') {
      throw new BadRequestException(
        'Meeting yang dibatalkan tidak dapat dibuatkan MoM.',
      );
    }

    const document = fillMomDocument(
      await loadMomTemplate(),
      buildMomFields(meeting),
    );
    const fileName = buildMomFileName(meeting);
    const storageKey = `meetings/${meeting.id}/mom/${randomUUID()}-${fileName}`;

    const previous = await this.prisma.meetingMom.findUnique({
      where: { meetingId: id },
      select: { storageKey: true },
    });

    await this.s3.upload({
      key: storageKey,
      body: document,
      contentType: DOCX_MIME_TYPE,
    });

    await this.prisma.meetingMom.upsert({
      where: { meetingId: id },
      create: {
        meetingId: id,
        fileName,
        storageKey,
        sizeBytes: document.length,
        generatedById: actor.id,
      },
      update: {
        fileName,
        storageKey,
        sizeBytes: document.length,
        generatedById: actor.id,
      },
    });

    if (previous && previous.storageKey !== storageKey) {
      try {
        await this.s3.remove(previous.storageKey);
      } catch {
        // Metadata tetap diperbarui walau objek lama gagal dihapus.
      }
    }

    await this.audit.record({
      actor,
      action: previous ? 'meeting.mom_regenerated' : 'meeting.mom_generated',
      entity: 'meeting',
      entityId: meeting.id,
      summary: `${previous ? 'membuat ulang' : 'membuat'} MoM meeting "${meeting.title}"`,
      metadata: { file_name: fileName, size_bytes: document.length },
    });

    return toMeetingResponse(await this.findMeeting(id));
  }

  async downloadMom(id: string) {
    const mom = await this.prisma.meetingMom.findUnique({
      where: { meetingId: id },
    });

    if (!mom) {
      throw new NotFoundException('MoM belum dibuat untuk meeting ini.');
    }

    return { mom, object: await this.s3.download(mom.storageKey) };
  }

  private async findMeeting(id: string) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id },
      include: meetingInclude,
    });
    if (!meeting) throw new NotFoundException('Meeting tidak ditemukan.');
    return meeting;
  }

  private async findProject(code?: string | null) {
    if (!code) return null;
    const project = await this.prisma.project.findUnique({
      where: { code },
      select: projectSelect,
    });
    if (!project) throw new NotFoundException('Proyek tidak ditemukan.');
    return project;
  }

  private async findProjectById(id: string | null) {
    if (!id) return null;
    return this.prisma.project.findUnique({
      where: { id },
      select: projectSelect,
    });
  }

  private async resolveParticipants(ids: string[], organizerId: string) {
    const unique = [...new Set([organizerId, ...ids])];
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique }, isActive: true },
      select: { id: true },
    });

    if (users.length !== unique.length) {
      throw new BadRequestException('Peserta tidak valid atau sudah nonaktif.');
    }

    return unique;
  }

  private resolvePlacement(
    mode: 'online' | 'onsite',
    meetingUrl: string | null | undefined,
    location: string | null | undefined,
    clientAddress: string | undefined,
  ) {
    if (mode === 'online') {
      return {
        meetingUrl: meetingUrl?.trim() || null,
        location: null,
      };
    }

    const onsiteLocation = location?.trim() || clientAddress?.trim() || null;
    if (!onsiteLocation) {
      throw new BadRequestException(
        'Lokasi onsite wajib diisi atau pilih proyek yang memiliki alamat klien.',
      );
    }

    return { meetingUrl: null, location: onsiteLocation };
  }
}

function parseDate(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${field} tidak valid.`);
  }
  return date;
}

function assertTimes(start: Date, end: Date): void {
  if (end <= start) {
    throw new BadRequestException('Waktu selesai harus setelah waktu mulai.');
  }
  if (end.getTime() - start.getTime() > MAX_DURATION_MS) {
    throw new BadRequestException('Durasi meeting maksimal 24 jam.');
  }
}

function assertTitle(title: string): void {
  if (!title.trim()) {
    throw new BadRequestException('Judul meeting wajib diisi.');
  }
}

function assertCanManage(actor: AuthenticatedUser, organizerId: string): void {
  if (
    actor.role !== 'admin' &&
    actor.role !== 'pm' &&
    actor.id !== organizerId
  ) {
    throw new ForbiddenException(
      'Hanya organizer, admin, atau PM yang dapat mengubah meeting ini.',
    );
  }
}

function assertCanManageMom(
  actor: AuthenticatedUser,
  organizerId: string,
): void {
  if (
    actor.role !== 'admin' &&
    actor.role !== 'pm' &&
    actor.id !== organizerId
  ) {
    throw new ForbiddenException(
      'Hanya organizer, admin, atau PM yang dapat membuat MoM meeting ini.',
    );
  }
}
