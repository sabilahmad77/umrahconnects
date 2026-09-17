import { SetMetadata } from '@nestjs/common';
import type { Permission } from '../../modules/rbac/catalog';

export const PERMISSIONS_KEY = 'permissions';

// Usage: @RequirePermissions('crm:pilgrim:read', 'crm:pilgrim:update') — ALL are required.
// Values are type-checked against the capability catalogue.
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
