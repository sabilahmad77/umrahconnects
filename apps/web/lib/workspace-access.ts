/** Mirrors the existing frontend role navigation; server authorization remains authoritative. */
export function canOpenWorkspaceRoute(pathname: string, roles: string[]): boolean {
  return !pathname.startsWith('/admin-') || roles.includes('SUPER_ADMIN');
}
