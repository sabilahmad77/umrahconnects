import { applyDecorators, SetMetadata } from '@nestjs/common';
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const OPTIONAL_PRINCIPAL_KEY = 'optionalPrincipal';

/**
 * A public route that also recognises a signed-in caller (F4). A valid bearer
 * token sets `request.user`, so the action can be attributed to its author; a
 * missing, expired or invalid one leaves the caller anonymous and the request
 * still succeeds. It grants nothing: the route stays public, no capability is
 * checked, and its database scope stays that of an anonymous request.
 */
export const PublicWithOptionalUser = () =>
  applyDecorators(SetMetadata(IS_PUBLIC_KEY, true), SetMetadata(OPTIONAL_PRINCIPAL_KEY, true));
