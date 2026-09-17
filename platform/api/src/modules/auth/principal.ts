/**
 * The authenticated caller as seen by guards and services.
 * Built by JwtStrategy from the signed token AND a fresh database read, so a
 * locked user, a suspended organization or a revoked session takes effect on
 * the very next request instead of when the access token expires.
 */
export interface Principal {
  sub: string;
  email?: string | null;
  phone?: string | null;
  tenantId: string;
  tenantType: string;
  tenantStatus: string;
  /** Role codes/names, informational only — authorization always re-reads the database. */
  roles: string[];
  emailVerified: boolean;
  iat?: number;
  exp?: number;
}
