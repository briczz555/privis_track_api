import { Prisma, type ProjectStatus } from '@prisma/client';

export const projectListInclude = Prisma.validator<Prisma.ProjectInclude>()({
  client: { select: { id: true, name: true } },
  stages: {
    select: { stageNo: true, title: true, isCompleted: true },
    orderBy: { stageNo: 'asc' },
  },
  documents: {
    where: { deletedAt: null },
    select: { id: true },
  },
});

export type ProjectListRow = Prisma.ProjectGetPayload<{
  include: typeof projectListInclude;
}>;

export const projectDetailInclude = Prisma.validator<Prisma.ProjectInclude>()({
  client: true,
  stages: {
    orderBy: { stageNo: 'asc' },
    include: {
      documents: {
        where: { deletedAt: null },
        orderBy: { uploadedAt: 'desc' },
        include: {
          uploadedBy: {
            select: { id: true, name: true, division: true },
          },
        },
      },
    },
  },
});

export type ProjectDetailRow = Prisma.ProjectGetPayload<{
  include: typeof projectDetailInclude;
}>;

interface StageLike {
  stageNo: number;
  title: string;
  isCompleted: boolean;
}

export interface StageState {
  completedStages: number;
  progressPercent: number;
  currentStage: number;
  currentStageTitle: string;
}

/** Progres = tahap selesai / 8; current_stage = tahap belum selesai terkecil. */
export function computeStageState(
  stages: StageLike[],
  status: ProjectStatus,
): StageState {
  const sorted = [...stages].sort((a, b) => a.stageNo - b.stageNo);
  const completedStages = sorted.filter((stage) => stage.isCompleted).length;
  const nextStage = sorted.find((stage) => !stage.isCompleted);

  let currentStage = nextStage?.stageNo ?? 8;
  if (completedStages === 0 && status === 'not_started') currentStage = 0;

  const currentStageTitle =
    sorted.find((stage) => stage.stageNo === currentStage)?.title ??
    sorted[0]?.title ??
    '';

  return {
    completedStages,
    progressPercent: Math.round((completedStages / 8) * 100),
    currentStage,
    currentStageTitle,
  };
}

function formatDate(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

export function mapProjectSummary(row: ProjectListRow) {
  const state = computeStageState(row.stages, row.status);

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    client: { id: row.client.id, name: row.client.name },
    status: row.status,
    current_stage: state.currentStage,
    current_stage_title: state.currentStageTitle,
    completed_stages: state.completedStages,
    progress_percent: state.progressPercent,
    document_count: row.documents.length,
    due_date: formatDate(row.dueDate),
    updated_at: row.updatedAt.toISOString(),
  };
}

export function mapProjectDetail(row: ProjectDetailRow) {
  const state = computeStageState(row.stages, row.status);

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    client: {
      id: row.client.id,
      name: row.client.name,
      address: row.client.address,
      contact_name: row.client.contactName,
      contact_role: row.client.contactRole,
      phone: row.client.phone,
    },
    status: row.status,
    current_stage: state.currentStage,
    current_stage_title: state.currentStageTitle,
    completed_stages: state.completedStages,
    progress_percent: state.progressPercent,
    stages: row.stages.map((stage) => ({
      stage_no: stage.stageNo,
      title: stage.title,
      is_completed: stage.isCompleted,
      completed_at: stage.completedAt?.toISOString() ?? null,
      document_count: stage.documents.length,
      documents: stage.documents.map((document) => ({
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
      })),
    })),
    updated_at: row.updatedAt.toISOString(),
  };
}
