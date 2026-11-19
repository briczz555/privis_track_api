import { describe, expect, it } from 'vitest';
import type { MeetingRow } from '../meeting.mapper.js';
import {
  buildMomFields,
  buildMomFileName,
  formatWibDate,
  formatWibTime,
} from './mom-fields.js';

function meeting(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Kickoff Proyek',
    mode: 'online',
    status: 'scheduled',
    startAt: new Date('2026-11-20T02:00:00.000Z'),
    endAt: new Date('2026-11-20T03:30:00.000Z'),
    meetingUrl: 'https://meet.google.com/abc-defg-hij',
    location: null,
    project: {
      id: 'project-1',
      code: 'PRJ-001',
      name: 'Aplikasi PriVis Track',
      client: {
        id: 'client-1',
        name: 'PT Briczz Digital',
        address: null,
        contactName: 'Budi Santoso',
      },
    },
    organizer: {
      id: 'user-1',
      name: 'Rina Kusuma',
      role: 'pm',
      division: 'Product',
    },
    ...overrides,
  } as unknown as MeetingRow;
}

describe('formatWibDate dan formatWibTime', () => {
  it('mengonversi UTC ke WIB (UTC+7)', () => {
    const date = new Date('2026-11-20T02:00:00.000Z');

    expect(formatWibDate(date)).toBe('20/11/2026');
    expect(formatWibTime(date)).toBe('09.00');
  });

  it('menggeser tanggal saat WIB melewati tengah malam', () => {
    const date = new Date('2026-11-19T18:30:00.000Z');

    expect(formatWibDate(date)).toBe('20/11/2026');
    expect(formatWibTime(date)).toBe('01.30');
  });
});

describe('buildMomFields', () => {
  it('mengisi informasi rapat dari meeting online', () => {
    expect(buildMomFields(meeting())).toEqual({
      projectName: 'Aplikasi PriVis Track',
      clientName: 'PT Briczz Digital',
      meetingTitle: 'Kickoff Proyek',
      date: '20/11/2026',
      timeRange: '09.00 – 10.30 WIB',
      place: 'Online - https://meet.google.com/abc-defg-hij',
      chair: 'Budi Santoso',
    });
  });

  it('memakai lokasi untuk meeting onsite', () => {
    const fields = buildMomFields(
      meeting({
        mode: 'onsite',
        meetingUrl: null,
        location: 'Kantor Klien, Jakarta',
      }),
    );

    expect(fields.place).toBe('Kantor Klien, Jakarta');
  });

  it('memakai tanda hubung saat meeting tanpa proyek', () => {
    const fields = buildMomFields(
      meeting({ project: null, mode: 'onsite', location: null }),
    );

    expect(fields.projectName).toBe('-');
    expect(fields.clientName).toBe('-');
    expect(fields.place).toBe('-');
    expect(fields.chair).toBe('-');
  });
});

describe('buildMomFileName', () => {
  it('menggabungkan kode proyek, tanggal WIB, dan slug judul', () => {
    expect(buildMomFileName(meeting())).toBe(
      'MoM_PRJ-001_2026-11-20_kickoff-proyek.docx',
    );
  });

  it('memakai UMUM saat meeting tanpa proyek', () => {
    expect(
      buildMomFileName(
        meeting({ project: null, title: 'Diskusi Internal & Evaluasi' }),
      ),
    ).toBe('MoM_UMUM_2026-11-20_diskusi-internal-evaluasi.docx');
  });
});
