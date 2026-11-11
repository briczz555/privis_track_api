import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type ActivityType,
  type DocumentType,
  type Prisma,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../common/types/authenticated-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { S3Service, type StoredObject } from '../storage/s3.service.js';

export interface UploadedDocumentFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const EXTENSION_TYPES: Record<string, DocumentType> = {
  pdf: 'pdf',
  doc: 'document',
  docx: 'document',
  xls: 'spreadsheet',
  xlsx: 'spreadsheet',
  csv: 'spreadsheet',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  fig: 'design',
};

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  fig: 'application/octet-stream',
};

const documentInclude = {
  uploadedBy: { select: { id: true, name: true, division: true } },
} satisfies Prisma.DocumentInclude;

type DocumentRow = Prisma.DocumentGetPayload<{
  include: typeof documentInclude;
}>;

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly config: ConfigService,
  ) {}

  async upload({
    projectCode,
    stageNo,
    file,
    requestedName,
    actor,
  }: {
    projectCode: string;
    stageNo: number;
    file: UploadedDocumentFile | undefined;
    requestedName?: string;
    actor: AuthenticatedUser;
  }) {
    if (!file) throw new BadRequestException('File wajib diunggah.');

    const maxMb = this.config.get<number>('MAX_UPLOAD_MB') ?? 20;
    if (file.size > maxMb * 1024 * 1024) {
      throw new PayloadTooLargeException(
        `Ukuran file maksimum ${maxMb} MB.`,
      );
    }

    const originalName = file.originalname.trim();
    const displayName = (requestedName?.trim() || originalName).slice(0, 255);
    const extension = originalName.split('.').pop()?.toLowerCase() ?? '';
    const type = EXTENSION_TYPES[extension];
    if (!type) {
      throw new UnsupportedMediaTypeException(
        'Tipe file tidak didukung. Gunakan PDF, DOC/DOCX, XLS/XLSX, CSV, PNG/JPG, atau FIG.',
      );
    }

    const mimeType = file.mimetype || MIME_BY_EXTENSION[extension];
    if (
      !mimeType.startsWith('application/') &&
      !mimeType.startsWith('image/') &&
      !mimeType.startsWith('text/')
    ) {
      throw new UnsupportedMediaTypeException('MIME type tidak didukung.');
    }

    const stage = await this.prisma.projectStage.findFirst({
      where: {
        stageNo,
        project: { code: projectCode },
      },
      include: { project: { select: { id: true, code: true } } },
    });

    if (!stage) throw new NotFoundException('Proyek atau tahap tidak ditemukan.');

    const safeName = displayName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageKey = `documents/${stage.project.code}/stage-${stageNo}/${randomUUID()}-${safeName}`;

    await this.s3.upload({
      key: storageKey,
      body: file.buffer,
      contentType: mimeType,
    });

    const document = await this.prisma.document.create({
      data: {
        projectId: stage.project.id,
        stageId: stage.id,
        name: displayName,
        type,
        mimeType,
        sizeBytes: file.size,
        storageKey,
        uploadedById: actor.id,
      },
      include: documentInclude,
    });

    await this.createActivity({
      projectId: stage.project.id,
      actor,
      type: 'document_uploaded',
      action: 'mengunggah',
      target: displayName,
    });

    return this.toResponse(document);
  }

  async list(projectCode: string, stageNo: number) {
    const stage = await this.prisma.projectStage.findFirst({
      where: { stageNo, project: { code: projectCode } },
      select: { id: true },
    });

    if (!stage) throw new NotFoundException('Proyek atau tahap tidak ditemukan.');

    const documents = await this.prisma.document.findMany({
      where: { stageId: stage.id, deletedAt: null },
      include: documentInclude,
      orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
    });

    return { data: documents.map((document) => this.toResponse(document)) };
  }

  async download(
    documentId: string,
    range?: string,
  ): Promise<{ document: DocumentRow; object: StoredObject }> {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: documentInclude,
    });

    if (!document || document.deletedAt) {
      throw new NotFoundException('Dokumen tidak ditemukan.');
    }

    return {
      document,
      object: await this.s3.download(document.storageKey, range),
    };
  }

  async remove(documentId: string, actor: AuthenticatedUser): Promise<void> {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document || document.deletedAt) {
      throw new NotFoundException('Dokumen tidak ditemukan.');
    }

    if (actor.role !== 'admin' && actor.role !== 'pm') {
      throw new ForbiddenException(
        'Hanya admin/PM yang boleh menghapus dokumen.',
      );
    }

    await this.prisma.document.update({
      where: { id: document.id },
      data: { deletedAt: new Date() },
    });

    try {
      await this.s3.remove(document.storageKey);
    } catch {
      // Metadata tetap dihapus walau objek storage gagal dihapus.
    }

    await this.createActivity({
      projectId: document.projectId,
      actor,
      type: 'document_deleted',
      action: 'menghapus',
      target: document.name,
    });
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

  private toResponse(document: DocumentRow) {
    return {
      id: document.id,
      name: document.name,
      type: document.type,
      mime_type: document.mimeType,
      size_bytes: document.sizeBytes,
      uploaded_by: {
        id: document.uploadedBy.id,
        name: document.uploadedBy.name,
        division: document.uploadedBy.division,
      },
      uploaded_at: document.uploadedAt.toISOString(),
    };
  }
}
