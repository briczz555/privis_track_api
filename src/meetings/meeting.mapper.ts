import { Prisma } from '@prisma/client';

export const meetingInclude = Prisma.validator<Prisma.MeetingInclude>()({
  project: {
    select: {
      id: true,
      code: true,
      name: true,
      client: { select: { id: true, name: true, address: true } },
    },
  },
  organizer: {
    select: { id: true, name: true, role: true, division: true },
  },
  participants: {
    include: {
      user: { select: { id: true, name: true, role: true, division: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
  mom: {
    include: { generatedBy: { select: { id: true, name: true } } },
  },
});

export type MeetingRow = Prisma.MeetingGetPayload<{
  include: typeof meetingInclude;
}>;

export function toMomResponse(mom: MeetingRow['mom']) {
  if (!mom) return null;

  return {
    file_name: mom.fileName,
    size_bytes: mom.sizeBytes,
    // `updated_at` menjadi waktu generate terakhir saat MoM dibuat ulang.
    generated_at: mom.updatedAt.toISOString(),
    generated_by: { id: mom.generatedBy.id, name: mom.generatedBy.name },
  };
}

export function toMeetingResponse(row: MeetingRow) {
  return {
    id: row.id,
    title: row.title,
    agenda: row.agenda,
    mode: row.mode,
    status: row.status,
    start_at: row.startAt.toISOString(),
    end_at: row.endAt.toISOString(),
    meeting_url: row.meetingUrl,
    location: row.location,
    project: row.project
      ? {
          id: row.project.id,
          code: row.project.code,
          name: row.project.name,
        }
      : null,
    client: row.project?.client
      ? { id: row.project.client.id, name: row.project.client.name }
      : null,
    organizer: {
      id: row.organizer.id,
      name: row.organizer.name,
      role: row.organizer.role,
      division: row.organizer.division,
    },
    participants: row.participants.map((participant) => ({
      id: participant.user.id,
      name: participant.user.name,
      role: participant.user.role,
      division: participant.user.division,
    })),
    notes: row.notes,
    mom: toMomResponse(row.mom),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}
