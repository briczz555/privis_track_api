import AdmZip from 'adm-zip';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Nilai yang diisikan otomatis ke Bagian 1 template MoM. Bagian lain
 * (peserta, agenda, pembahasan, persetujuan) sengaja dibiarkan kosong agar
 * diisi manual di Word setelah dokumen diunduh.
 */
export interface MomFields {
  projectName: string;
  clientName: string;
  meetingTitle: string;
  date: string;
  timeRange: string;
  place: string;
  chair: string;
}

/**
 * Placeholder persis seperti pada `Template_MoM_Client.docx`. Word memecah
 * teks menjadi beberapa run, jadi pengisian dilakukan per paragraf pada XML,
 * bukan dengan replace teks biasa.
 */
const FIELD_BY_PLACEHOLDER: Record<string, keyof MomFields> = {
  '[Nama proyek]': 'projectName',
  '[Nama klien / perusahaan]': 'clientName',
  '[Contoh: Kickoff / Review Progres / UAT / Pembahasan Revisi]':
    'meetingTitle',
  '[hh/bb/tttt]': 'date',
  '[00.00 – 00.00 WIB]': 'timeRange',
  '[Lokasi / Google Meet / Zoom]': 'place',
  '[Nama]': 'chair',
};

const TEMPLATE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  'templates',
  'mom-client.docx',
);

const PARAGRAPH_PATTERN = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
const TEXT_NODE_PATTERN = /<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g;
const TEXT_CONTENT_PATTERN = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;

let cachedTemplate: Buffer | null = null;

/** Template resmi disimpan di repo agar hasil konsisten dan bisa diarsipkan. */
export async function loadMomTemplate(): Promise<Buffer> {
  cachedTemplate ??= await readFile(TEMPLATE_PATH);
  return cachedTemplate;
}

/** Mengisi Bagian 1 template MoM tanpa merusak formatting dokumen. */
export function fillMomDocument(template: Buffer, fields: MomFields): Buffer {
  const zip = new AdmZip(template);
  const entry = zip.getEntry('word/document.xml');
  if (!entry) {
    throw new Error(
      'Template MoM tidak valid: word/document.xml tidak ditemukan.',
    );
  }

  const xml = entry.getData().toString('utf8');
  zip.updateFile('word/document.xml', Buffer.from(fillXml(xml, fields), 'utf8'));
  return zip.toBuffer();
}

function fillXml(xml: string, fields: MomFields): string {
  const filled = new Set<keyof MomFields>();

  const result = xml.replace(PARAGRAPH_PATTERN, (paragraph) => {
    const field = FIELD_BY_PLACEHOLDER[normalizeText(paragraphText(paragraph))];
    if (!field) return paragraph;

    filled.add(field);
    return writeParagraphText(paragraph, fields[field] || '-');
  });

  const missing = [...new Set(Object.values(FIELD_BY_PLACEHOLDER))].filter(
    (field) => !filled.has(field),
  );
  if (missing.length > 0) {
    throw new Error(
      `Placeholder template MoM tidak ditemukan: ${missing.join(', ')}.`,
    );
  }

  return result;
}

/** Teks gabungan seluruh run pada satu paragraf. */
function paragraphText(paragraph: string): string {
  return [...paragraph.matchAll(TEXT_CONTENT_PATTERN)]
    .map((match) => decodeXml(match[1]))
    .join('');
}

/**
 * Menulis nilai ke run pertama paragraf dan mengosongkan run lainnya sehingga
 * formatting paragraf tetap mengikuti template.
 */
function writeParagraphText(paragraph: string, value: string): string {
  let first = true;

  return paragraph.replace(TEXT_NODE_PATTERN, () => {
    const text = first ? escapeXml(value) : '';
    first = false;
    return `<w:t xml:space="preserve">${text}</w:t>`;
  });
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&amp;/g, '&');
}
