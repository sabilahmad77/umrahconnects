import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import { apiErrorMessage } from '../lib/api-error';
import { PASSWORD_RULE, passwordProblem } from '../lib/password-policy';
import { PILGRIM_STATUSES } from '../lib/statuses';

/**
 * Guards against the class of defect this integration loop kept finding: a UI
 * offering a value the server does not accept.
 *
 * Every one of these lists shipped with members that were not enum values, so
 * the control looked fine and then returned 400 the moment anyone used it. The
 * enums are read out of the Prisma schema and the server DTOs at test time, so
 * a backend change that is not mirrored on the web fails here instead of in
 * front of a user.
 */
const API = join(__dirname, '..', '..', '..', 'platform', 'api');
const SCHEMA = readFileSync(join(API, 'prisma', 'schema.prisma'), 'utf8');

function prismaEnum(name: string): string[] {
  const m = SCHEMA.match(new RegExp(`enum ${name} \\{([^}]*)\\}`));
  if (!m) throw new Error(`enum ${name} not found in schema.prisma`);
  return m[1]
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, '').trim())
    .filter((l) => l && !l.startsWith('@@'));
}

/** The literal string array assigned to `name` in a web source file. */
function webList(file: string, name: string): string[] {
  const src = readFileSync(join(__dirname, '..', file), 'utf8');
  const m = src.match(new RegExp(`const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\]`));
  if (!m) throw new Error(`${name} not found in ${file}`);
  return [...m[1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]);
}

describe('status vocabularies match the server enums', () => {
  it('booking filters are all real BookingStatus members', () => {
    const real = prismaEnum('BookingStatus');
    const offered = webList('components/bookings/booking-list.tsx', 'FILTERS').filter((s) => s !== 'ALL');
    expect(offered.length).toBeGreaterThan(0);
    expect(offered.filter((s) => !real.includes(s))).toEqual([]);
  });

  it('pilgrim statuses match PilgrimStatus exactly', () => {
    expect([...PILGRIM_STATUSES].sort()).toEqual(prismaEnum('PilgrimStatus').sort());
  });

  it('pilgrim document types are all real DocumentType members', () => {
    const dto = readFileSync(join(API, 'src/modules/pilgrims/dto/add-document.dto.ts'), 'utf8');
    const real = [...dto.matchAll(/^\s*([A-Z_]+) = '/gm)].map((m) => m[1]);
    const offered = webList('components/pilgrims/pilgrim-detail.tsx', 'DOC_TYPES');
    expect(real.length).toBeGreaterThan(0);
    expect(offered.filter((s) => !real.includes(s))).toEqual([]);
  });

  it('regulatory systems are all real RegulatorySystem members', () => {
    const real = prismaEnum('RegulatorySystem');
    // The visa application form (create + edit) owns the list since A03b.
    const offered = webList('components/compliance/visa-form.tsx', 'REGULATORY_SYSTEMS');
    expect(offered.length).toBeGreaterThan(0);
    expect(offered.filter((s) => !real.includes(s))).toEqual([]);
  });

  it('vehicle types match TransportType exactly', () => {
    const real = prismaEnum('TransportType');
    // The shared fleet form (add + edit vehicle) owns the list since A03b.
    for (const file of ['components/transport/fleet-forms.tsx']) {
      expect(webList(file, 'VEHICLE_TYPES').sort()).toEqual([...real].sort());
    }
  });

  it('listing-booking transitions mirror the marketplace service', () => {
    const svc = readFileSync(join(API, 'src/modules/marketplace/marketplace.service.ts'), 'utf8');
    const web = readFileSync(join(__dirname, '..', 'lib/booking-transitions.ts'), 'utf8');
    const grab = (src: string) => {
      const m = src.match(/BOOKING_TRANSITIONS: Record<string, string\[\]> = \{([\s\S]*?)\};/);
      return m ? m[1].replace(/\s/g, '') : null;
    };
    expect(grab(web)).not.toBeNull();
    expect(grab(web)).toBe(grab(svc));
  });

  it('invoice transitions mirror the finance service', () => {
    const svc = readFileSync(join(API, 'src/modules/finance/finance.service.ts'), 'utf8');
    const web = readFileSync(join(__dirname, '..', 'components/finance/invoice-detail.tsx'), 'utf8');
    const grab = (src: string) => {
      const m = src.match(/INVOICE_TRANSITIONS: Record<string, string\[\]> = \{([\s\S]*?)\};/);
      return m ? m[1].replace(/\s/g, '') : null;
    };
    expect(grab(web)).not.toBeNull();
    expect(grab(web)).toBe(grab(svc));
  });
});

/** A `NAME: Record<string, string[]> = { ... };` table, whitespace-free, from a source file. */
function transitionTable(src: string, name: string): string | null {
  const m = src.match(new RegExp(`${name}: Record<string, string\\[\\]> = \\{([\\s\\S]*?)\\};`));
  return m ? m[1].replace(/\s/g, '') : null;
}
/** The string array assigned to `name` in an API source file. */
function apiList(file: string, name: string): string[] {
  const src = readFileSync(join(API, file), 'utf8');
  const m = src.match(new RegExp(`const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\]`));
  if (!m) throw new Error(`${name} not found in ${file}`);
  return [...m[1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]);
}

describe('business workflows mirror the server (hotels, transport, visa)', () => {
  const pairs: [string, string, string][] = [
    ['HOTEL_BOOKING_TRANSITIONS', 'src/modules/hotels/hotel-workflow.ts', 'hooks/use-hotels.ts'],
    ['TRANSPORT_ASSIGNMENT_TRANSITIONS', 'src/modules/transport/transport-workflow.ts', 'hooks/use-transport.ts'],
    ['VISA_TRANSITIONS', 'src/modules/compliance/visa-workflow.ts', 'hooks/use-visa.ts'],
  ];
  it.each(pairs)('%s is identical on web and server', (name, apiFile, webFile) => {
    const api = transitionTable(readFileSync(join(API, apiFile), 'utf8'), name);
    const web = transitionTable(readFileSync(join(__dirname, '..', webFile), 'utf8'), name);
    expect(api).not.toBeNull();
    expect(web).toBe(api);
  });

  it('status vocabularies match the DTOs and enums', () => {
    expect(webList('hooks/use-hotels.ts', 'HOTEL_BOOKING_STATUSES')).toEqual(apiList('src/modules/hotels/dto/hotel.dto.ts', 'HOTEL_BOOKING_STATUSES'));
    expect(webList('hooks/use-transport.ts', 'ASSIGNMENT_STATUSES')).toEqual(apiList('src/modules/transport/dto/transport.dto.ts', 'ASSIGNMENT_STATUSES'));
    expect([...webList('hooks/use-visa.ts', 'VISA_STATUSES')].sort()).toEqual(prismaEnum('VisaStatus').sort());
    expect([...webList('hooks/use-hotels.ts', 'HOTEL_CONTRACT_TYPES')].sort()).toEqual(prismaEnum('HotelContractType').sort());
    const movements = webList('components/transport/fleet-forms.tsx', 'MOVEMENT_TYPES');
    expect(movements.filter((m) => !prismaEnum('MovementType').includes(m))).toEqual([]);
  });

  it('hand-set statuses are exactly what the server lets a form set', () => {
    const cases: [string, string, string][] = [
      ['hooks/use-hotels.ts', 'src/modules/hotels/hotel-workflow.ts', 'ROOM_MANUAL_STATUSES'],
      ['hooks/use-hotels.ts', 'src/modules/hotels/hotel-workflow.ts', 'HOTEL_BOOKING_INITIAL_STATUSES'],
      ['hooks/use-transport.ts', 'src/modules/transport/transport-workflow.ts', 'VEHICLE_MANUAL_STATUSES'],
      ['hooks/use-transport.ts', 'src/modules/transport/transport-workflow.ts', 'DRIVER_MANUAL_STATUSES'],
      ['hooks/use-transport.ts', 'src/modules/transport/transport-workflow.ts', 'ROUTE_MANUAL_STATUSES'],
      ['hooks/use-transport.ts', 'src/modules/transport/transport-workflow.ts', 'ASSIGNMENT_INITIAL_STATUSES'],
      ['hooks/use-transport.ts', 'src/modules/transport/transport-workflow.ts', 'BOOKABLE_ROUTE_STATUSES'],
      ['hooks/use-visa.ts', 'src/modules/compliance/visa-workflow.ts', 'VISA_EDIT_STATUSES'],
      ['hooks/use-visa.ts', 'src/modules/compliance/visa-workflow.ts', 'VISA_TERMINAL_STATUSES'],
    ];
    for (const [webFile, apiFile, name] of cases) {
      expect(webList(webFile, name), name).toEqual(apiList(apiFile, name));
    }
  });

  it('no business form offers a payment status control', () => {
    for (const file of ['components/hotels/hotel-bookings-view.tsx', 'components/transport/trip-shared.tsx', 'components/compliance/visa-form.tsx']) {
      const src = readFileSync(join(__dirname, '..', file), 'utf8');
      expect(src, file).not.toMatch(/paymentStatus:\s*(form|f)\./);
    }
  });
});

describe('password policy matches the server rule', () => {
  it('uses the same expression the register DTO enforces', () => {
    const dto = readFileSync(join(API, 'src/modules/auth/dto/register.dto.ts'), 'utf8');
    const m = dto.match(/export const PASSWORD_RULE = (\/.*\/);/);
    expect(m).not.toBeNull();
    expect(PASSWORD_RULE.source).toBe(new RegExp(m![1].slice(1, -1)).source);
  });

  it.each(['password', '12345678', 'Ab1', 'abc12'])('rejects %s', (pw) => {
    expect(passwordProblem(pw)).not.toBe('');
  });

  it.each(['Traveler-2026', 'passw0rd', 'Admin@1234'])('accepts %s', (pw) => {
    expect(passwordProblem(pw)).toBe('');
  });
});

describe('API error messages', () => {
  it('joins a validation array into a sentence instead of printing JSON', () => {
    const err = { response: { data: { error: { message: ['property search should not exist', 'status must be a valid enum value'] } } } };
    const msg = apiErrorMessage(err);
    expect(msg).toBe('Property search should not exist. status must be a valid enum value.');
    expect(msg).not.toContain('[');
  });

  it('passes a plain message through', () => {
    expect(apiErrorMessage({ response: { data: { error: { message: 'Invoice is DRAFT and cannot take payments' } } } }))
      .toBe('Invoice is DRAFT and cannot take payments');
  });

  it('falls back when there is nothing usable', () => {
    expect(apiErrorMessage({}, 'Could not save')).toBe('Could not save');
    expect(apiErrorMessage({ response: { data: { error: { message: [] } } } }, 'Could not save')).toBe('Could not save');
  });
});

describe('the refresh token is never held by page scripts', () => {
  it('nothing writes refreshToken to localStorage', () => {
    for (const file of ['lib/api.ts', 'hooks/use-auth.ts', 'components/providers/auth-provider.tsx']) {
      const src = readFileSync(join(__dirname, '..', file), 'utf8');
      expect(src).not.toMatch(/localStorage\.setItem\(\s*'refreshToken'/);
      expect(src).not.toMatch(/localStorage\.getItem\(\s*'refreshToken'/);
    }
  });
});
