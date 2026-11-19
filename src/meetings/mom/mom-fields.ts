import type { MeetingRow } from '../meeting.mapper.js';
import type { MomFields } from './mom-document.js';

const WIB_TIME_ZONE = 'Asia/Jakarta';
const EMPTY = '-';

/** Rentang waktu memakai en dash agar seragam dengan template. */
const TIME_RANGE_SEPARATOR = ' – ';

export const DOCX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Hanya Bagian 1 (Informasi Rapat) yang terisi otomatis; bagian peserta,
 * agenda, pembahasan, dan tanda tangan dibiarkan kosong untuk diisi manual.
 */
export function buildMomFields(meeting: MeetingRow): MomFields {
  return {
    projectName: meeting.project?.name ?? EMPTY,
    clientName: meeting.project?.client.name ?? EMPTY,
    meetingTitle: meeting.title,
    date: formatWibDate(meeting.startAt),
    timeRange: `${formatWibTime(meeting.startAt)}${TIME_RANGE_SEPARATOR}${formatWibTime(meeting.endAt)} WIB`,
    place: describePlace(meeting),
    chair: meeting.organizer.name,
  };
}

/** Contoh: `MoM_PRJ-001_2026-11-20_kickoff-meeting.docx`. */
export function buildMomFileName(meeting: MeetingRow): string {
  const code = meeting.project?.code ?? 'UMUM';
  const date = formatWibIsoDate(meeting.startAt);
  const slug = slugify(meeting.title) || 'meeting';

  return `MoM_${sanitizeSegment(code)}_${date}_${slug}.docx`;
}

export function formatWibDate(date: Date): string {
  const parts = wibParts(date);
  return `${parts.day}/${parts.month}/${parts.year}`;
}

export function formatWibTime(date: Date): string {
  const parts = wibParts(date);
  return `${parts.hour}.${parts.minute}`;
}

function formatWibIsoDate(date: Date): string {
  const parts = wibParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function wibParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: WIB_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  return {
    day: value('day'),
    month: value('month'),
    year: value('year'),
    hour: value('hour'),
    minute: value('minute'),
  };
}

function describePlace(meeting: MeetingRow): string {
  if (meeting.mode === 'online') {
    return meeting.meetingUrl ? `Online - ${meeting.meetingUrl}` : 'Online';
  }
  return meeting.location ?? EMPTY;
}

function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

function sanitizeSegment(text: string): string {
  return text.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40);
}
