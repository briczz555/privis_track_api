/// Validasi signature file berdasarkan ekstensi. Ini menutup celah file yang
/// dinamai `.pdf` tetapi isinya executable/arsip lain, tanpa membaca seluruh
/// isi file.
const PDF_HEADER = Buffer.from('%PDF-');
const ZIP_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const OLE_HEADER = Buffer.from([
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
]);
const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff]);

const PDF_SCAN_BYTES = 1024;
const TEXT_SCAN_BYTES = 8192;

function startsWith(buffer: Buffer, signature: Buffer): boolean {
  return (
    buffer.length >= signature.length &&
    buffer.subarray(0, signature.length).equals(signature)
  );
}

/// CSV tidak punya magic number. Yang dicegah adalah file biner yang menyamar
/// sebagai CSV (mengandung byte NUL pada bagian awal).
function looksLikeText(buffer: Buffer): boolean {
  return !buffer.subarray(0, TEXT_SCAN_BYTES).includes(0);
}

export function matchesFileSignature(
  extension: string,
  buffer: Buffer,
): boolean {
  switch (extension) {
    case 'pdf':
      return buffer
        .subarray(0, Math.min(buffer.length, PDF_SCAN_BYTES))
        .includes(PDF_HEADER);
    case 'png':
      return startsWith(buffer, PNG_HEADER);
    case 'jpg':
    case 'jpeg':
      return startsWith(buffer, JPEG_HEADER);
    // Format Office lama (DOC/XLS) memakai container OLE/CFB.
    case 'doc':
    case 'xls':
      return startsWith(buffer, OLE_HEADER);
    // Format Office baru, dan file .fig Figma, memakai container ZIP.
    case 'docx':
    case 'xlsx':
    case 'fig':
      return startsWith(buffer, ZIP_HEADER);
    case 'csv':
      return looksLikeText(buffer);
    default:
      return false;
  }
}
