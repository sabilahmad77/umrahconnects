import { describe, expect, it } from 'vitest';
import { sniffFile } from './file-sniff';

const pad = (b: number[] | string, n = 32) => {
  const head = typeof b === 'string' ? Buffer.from(b, 'latin1') : Buffer.from(b);
  return Buffer.concat([head, Buffer.alloc(Math.max(0, n - head.length))]);
};

describe('sniffFile', () => {
  it('recognises real document and image signatures', () => {
    expect(sniffFile(pad('%PDF-1.7\n'))?.type).toBe('pdf');
    expect(sniffFile(pad([0xff, 0xd8, 0xff, 0xe0]))?.type).toBe('jpeg');
    expect(sniffFile(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.type).toBe('png');
    expect(sniffFile(pad('GIF89a'))?.type).toBe('gif');
    expect(sniffFile(pad('RIFF\x00\x00\x00\x00WEBPVP8 '))?.type).toBe('webp');
  });

  it('rejects renamed scripts, HTML and SVG', () => {
    expect(sniffFile(pad('<html><script>alert(1)</script></html>'))).toBeNull();
    expect(sniffFile(pad('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffFile(pad('#!/bin/sh\nrm -rf /\n'))).toBeNull();
    expect(sniffFile(pad('MZ\x90\x00'))).toBeNull();
  });

  it('rejects image/HTML polyglots and tiny buffers', () => {
    expect(sniffFile(pad('GIF89a<script>alert(1)</script>', 64))).toBeNull();
    expect(sniffFile(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});
