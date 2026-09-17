import { describe, expect, it } from 'vitest';
import { ValidationPipe } from '@nestjs/common';
import { IsArray, IsObject, IsOptional } from 'class-validator';
import { RawJson } from './decorators/raw-json.decorator';

class Probe {
  @IsOptional() @IsArray() @RawJson() items?: unknown[];
  @IsOptional() @IsObject() @RawJson() obj?: Record<string, unknown>;
}

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

describe('global ValidationPipe behaviour (regression guard)', () => {
  it('keeps plain objects inside untyped arrays and objects', async () => {
    const out = await pipe.transform({ items: [{ a: 1 }, 'x'], obj: { nested: { b: 2, list: [{ c: 3 }] } } }, { type: 'body', metatype: Probe });
    expect(out.items).toEqual([{ a: 1 }, 'x']);
    expect(out.obj).toEqual({ nested: { b: 2, list: [{ c: 3 }] } });
  });
});
