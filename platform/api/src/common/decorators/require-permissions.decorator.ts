import { SetMetadata } from '@nestjs/common';
export const PERMISSIONS_KEY = 'permissions';

// Usage: @RequirePermissions('crm:pilgrim:read', 'crm:pilgrim:write')
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
