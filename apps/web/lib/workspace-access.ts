/** UI guard consumes /auth/me capabilities. The API remains authoritative. */
const READ_ACCESS: Record<string, string> = {
 '/dashboard': 'crm:pilgrim:read', '/pilgrims': 'crm:pilgrim:read', '/groups': 'crm:pilgrim:read',
 '/bookings': 'booking:booking:read', '/packages': 'booking:package:read',
 '/hotel-dashboard': 'hotel:allotment:read', '/hotel-bookings': 'hotel:allotment:read', '/hotels': 'hotel:allotment:read',
 '/transport-dashboard': 'transport:vehicle:read', '/transport': 'transport:vehicle:read',
 '/visa-dashboard': 'visa:application:read', '/visa-documents': 'visa:application:read', '/visa-requests': 'visa:application:read', '/compliance': 'visa:application:read',
 '/finance-dashboard': 'finance:report:read', '/finance-payments': 'finance:payment:read', '/finance': 'finance:invoice:read', '/budget-plans': 'finance:report:read', '/reports': 'reporting:report:read',
};
export function canOpenWorkspaceRoute(pathname: string, roles: string[], permissions?: string[]): boolean {
 const path = pathname.split(/[?#]/)[0];
 if (path.startsWith('/admin-')) return roles.includes('SUPER_ADMIN') && !!permissions?.some(p => p.startsWith('platform:'));
 const required = Object.entries(READ_ACCESS).find(([route]) => path === route || path.startsWith(route + '/'))?.[1];
 return !required || !!permissions?.includes(required);
}
