export type SniffedType = 'pdf' | 'jpeg' | 'png' | 'gif' | 'webp' | 'heic' | 'tiff';

const TYPES: Record<SniffedType, { mime: string; ext: string }> = {
  pdf: { mime: 'application/pdf', ext: 'pdf' },
  jpeg: { mime: 'image/jpeg', ext: 'jpg' },
  png: { mime: 'image/png', ext: 'png' },
  gif: { mime: 'image/gif', ext: 'gif' },
  webp: { mime: 'image/webp', ext: 'webp' },
  heic: { mime: 'image/heic', ext: 'heic' },
  tiff: { mime: 'image/tiff', ext: 'tiff' },
};

const starts = (b: Buffer, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);
const ascii = (b: Buffer, start: number, end: number) => b.subarray(start, end).toString('latin1');

/**
 * Identifies a file by its leading bytes. Anything not recognised is rejected by
 * callers, so a script or HTML file renamed to `.png` never gets stored.
 */
export function sniffFile(buffer: Buffer): { type: SniffedType; mime: string; ext: string } | null {
  if (!buffer || buffer.length < 12) return null;
  let type: SniffedType | null = null;
  if (ascii(buffer, 0, 5) === '%PDF-') type = 'pdf';
  else if (starts(buffer, [0xff, 0xd8, 0xff])) type = 'jpeg';
  else if (starts(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) type = 'png';
  else if (ascii(buffer, 0, 6) === 'GIF87a' || ascii(buffer, 0, 6) === 'GIF89a') type = 'gif';
  else if (ascii(buffer, 0, 4) === 'RIFF' && ascii(buffer, 8, 12) === 'WEBP') type = 'webp';
  else if (ascii(buffer, 4, 8) === 'ftyp' && /^(heic|heix|hevc|hevx|mif1|msf1)$/.test(ascii(buffer, 8, 12))) type = 'heic';
  else if (starts(buffer, [0x49, 0x49, 0x2a, 0x00]) || starts(buffer, [0x4d, 0x4d, 0x00, 0x2a])) type = 'tiff';
  if (!type) return null;
  // Polyglot guard: reject image payloads that embed active HTML/SVG/script content early in the file.
  if (type !== 'pdf') {
    const head = ascii(buffer, 0, Math.min(buffer.length, 2048)).toLowerCase();
    if (head.includes('<script') || head.includes('<html') || head.includes('<svg')) return null;
  }
  return { type, ...TYPES[type] };
}
