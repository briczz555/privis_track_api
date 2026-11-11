import { describe, expect, it } from 'vitest';
import { matchesFileSignature } from './file-signature.js';

const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);

describe('matchesFileSignature', () => {
  it('menerima PDF dengan header %PDF-', () => {
    expect(matchesFileSignature('pdf', Buffer.from('%PDF-1.7\ntrailer'))).toBe(
      true,
    );
  });

  it('menolak file non-PDF yang dinamai .pdf', () => {
    expect(
      matchesFileSignature('pdf', Buffer.from('MZ\x90\x00executable')),
    ).toBe(false);
  });

  it('menerima PNG dan JPEG sesuai magic bytes', () => {
    expect(matchesFileSignature('png', PNG)).toBe(true);
    expect(matchesFileSignature('jpg', JPEG)).toBe(true);
    expect(matchesFileSignature('jpeg', JPEG)).toBe(true);
  });

  it('menerima DOC/XLS container OLE', () => {
    expect(matchesFileSignature('doc', OLE)).toBe(true);
    expect(matchesFileSignature('xls', OLE)).toBe(true);
  });

  it('menerima DOCX/XLSX/FIG container ZIP', () => {
    expect(matchesFileSignature('docx', ZIP)).toBe(true);
    expect(matchesFileSignature('xlsx', ZIP)).toBe(true);
    expect(matchesFileSignature('fig', ZIP)).toBe(true);
  });

  it('menolak ekstensi yang tidak dikenal', () => {
    expect(matchesFileSignature('exe', Buffer.from('MZ'))).toBe(false);
  });

  it('menerima CSV teks dan menolak CSV biner', () => {
    expect(matchesFileSignature('csv', Buffer.from('nama,nilai\nA,1\n'))).toBe(
      true,
    );
    expect(
      matchesFileSignature('csv', Buffer.from([0x41, 0x00, 0x42, 0x43])),
    ).toBe(false);
  });
});
