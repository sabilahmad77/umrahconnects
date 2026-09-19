const fs = require('fs'); const zlib = require('zlib'); const path = require('path');
const dir = process.argv[2];
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
function png(w, h, color) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; const t = x / w, s = y / h; raw[o] = Math.round(color[0] * (1 - s) + 255 * s * t); raw[o + 1] = Math.round(color[1] * (1 - t) + 80 * s); raw[o + 2] = Math.round(color[2] * (0.6 + 0.4 * t)); } }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
fs.writeFileSync(path.join(dir, 'room-front.png'), png(640, 360, [15, 61, 55]));
fs.writeFileSync(path.join(dir, 'room-view.png'), png(640, 360, [200, 169, 107]));
fs.writeFileSync(path.join(dir, 'fake-photo.png'), Buffer.from('This is a plain text file that was renamed to .png\n'.repeat(4)));
fs.writeFileSync(path.join(dir, 'notes.txt'), 'plain text notes\n');
fs.writeFileSync(path.join(dir, 'huge-photo.png'), Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(6 * 1024 * 1024, 1)]));
fs.writeFileSync(path.join(dir, 'passport.pdf'), Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n' + ' '.repeat(200)));
console.log(fs.readdirSync(dir).map((f) => `${f} ${fs.statSync(path.join(dir, f)).size}`).join('\n'));
