import AdmZip from 'adm-zip';
import { describe, expect, it } from 'vitest';
import { fillMomDocument, loadMomTemplate } from './mom-document.js';
import type { MomFields } from './mom-document.js';

const fields: MomFields = {
  projectName: 'Aplikasi PriVis Track',
  clientName: 'PT Briczz Digital',
  meetingTitle: 'Kickoff Proyek',
  date: '20/11/2026',
  timeRange: '09.00 – 10.30 WIB',
  place: 'Online - https://meet.google.com/abc-defg-hij',
  chair: 'Rina Kusuma',
};

function documentXml(buffer: Buffer): string {
  const entry = new AdmZip(buffer).getEntry('word/document.xml');
  if (!entry) throw new Error('word/document.xml tidak ditemukan');
  return entry.getData().toString('utf8');
}

function paragraphTexts(buffer: Buffer): string[] {
  return [...documentXml(buffer).matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map(
    (paragraph) =>
      [...paragraph[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
        .map((match) => match[1])
        .join('')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&'),
  );
}

describe('fillMomDocument', () => {
  it('mengisi tujuh field Bagian 1 pada template asli', async () => {
    const template = await loadMomTemplate();
    const texts = paragraphTexts(fillMomDocument(template, fields));

    expect(texts).toContain('Aplikasi PriVis Track');
    expect(texts).toContain('PT Briczz Digital');
    expect(texts).toContain('Kickoff Proyek');
    expect(texts).toContain('20/11/2026');
    expect(texts).toContain('09.00 – 10.30 WIB');
    expect(texts).toContain('Online - https://meet.google.com/abc-defg-hij');
    expect(texts).toContain('Rina Kusuma');
  });

  it('tidak menyisakan placeholder pada dokumen hasil', async () => {
    const texts = paragraphTexts(
      fillMomDocument(await loadMomTemplate(), fields),
    );

    expect(texts.some((text) => text.startsWith('[Nama'))).toBe(false);
    expect(texts.some((text) => text.includes('[hh/bb/tttt]'))).toBe(false);
    expect(texts.some((text) => text.includes('WIB]'))).toBe(false);
  });

  it('membiarkan bagian peserta, agenda, dan pembahasan tetap kosong', async () => {
    const texts = paragraphTexts(
      fillMomDocument(await loadMomTemplate(), fields),
    );

    expect(texts).toContain('2. Daftar Peserta');
    expect(texts).toContain('[Agenda 1]');
    expect(texts).toContain('4. Ringkasan Pembahasan dan Keputusan');
    expect(texts).toContain('5. Persetujuan');
  });

  it('meng-escape karakter khusus XML', async () => {
    const texts = paragraphTexts(
      fillMomDocument(await loadMomTemplate(), {
        ...fields,
        meetingTitle: 'Review <UAT> & Revisi',
        projectName: 'R&D Portal',
      }),
    );

    expect(texts).toContain('Review <UAT> & Revisi');
    expect(texts).toContain('R&D Portal');
  });

  it('menjaga jumlah entry zip dan semua XML tetap valid', async () => {
    const template = await loadMomTemplate();
    const result = fillMomDocument(template, fields);
    const before = new AdmZip(template).getEntries();
    const after = new AdmZip(result).getEntries();

    expect(after).toHaveLength(before.length);
    for (const entry of after) {
      if (!entry.entryName.endsWith('.xml')) continue;
      expect(() => entry.getData().toString('utf8')).not.toThrow();
      expect(entry.getData().toString('utf8')).toMatch(/^<\?xml/);
    }
  });

  it('menolak template yang kehilangan placeholder', async () => {
    const zip = new AdmZip(await loadMomTemplate());
    const minimal = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Tanpa placeholder</w:t></w:r></w:p></w:body></w:document>`;
    zip.updateFile('word/document.xml', Buffer.from(minimal, 'utf8'));

    expect(() => fillMomDocument(zip.toBuffer(), fields)).toThrow(
      /placeholder template mom tidak ditemukan/i,
    );
  });

  it('menolak file yang bukan template DOCX', () => {
    expect(() => fillMomDocument(Buffer.from('bukan docx'), fields)).toThrow();
  });
});
