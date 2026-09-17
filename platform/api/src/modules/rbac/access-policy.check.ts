import { Injectable, Logger, OnApplicationBootstrap, RequestMethod } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import { ANY_AUTHENTICATED_KEY } from '../../common/decorators/access.decorator';
import { isKnownPermission } from './catalog';
import { RbacService } from './rbac.service';

export interface RoutePolicy {
  method: string;
  path: string;
  handler: string;
  policy: 'public' | 'authenticated' | 'permissions' | 'none';
  permissions: string[];
}

/**
 * Boot-time enforcement of the access model:
 *  - every route declares a policy (deny-by-default is also enforced per request);
 *  - every required capability exists in the catalogue;
 *  - the catalogue and system roles are synced to the database.
 * The API refuses to start if any check fails.
 */
@Injectable()
export class AccessPolicyCheck implements OnApplicationBootstrap {
  private readonly logger = new Logger(AccessPolicyCheck.name);

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
  ) {}

  inventory(): RoutePolicy[] {
    const routes: RoutePolicy[] = [];
    for (const wrapper of this.discovery.getControllers()) {
      const { instance, metatype } = wrapper;
      if (!instance || !metatype) continue;
      const proto = Object.getPrototypeOf(instance);
      const base = [].concat(Reflect.getMetadata(PATH_METADATA, metatype) ?? '')[0] as string;
      for (const name of this.scanner.getAllMethodNames(proto)) {
        const fn = proto[name];
        const path = Reflect.getMetadata(PATH_METADATA, fn);
        if (path === undefined) continue;
        const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, fn) as number];
        const targets = [fn, metatype];
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets);
        const permissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, targets) ?? [];
        const anyAuth = this.reflector.getAllAndOverride<boolean>(ANY_AUTHENTICATED_KEY, targets);
        routes.push({
          method,
          path: `/${[base, ...[].concat(path)].filter(Boolean).join('/')}`.replace(/\/+/g, '/'),
          handler: `${metatype.name}.${name}`,
          policy: isPublic ? 'public' : permissions.length ? 'permissions' : anyAuth ? 'authenticated' : 'none',
          permissions,
        });
      }
    }
    return routes;
  }

  async onApplicationBootstrap() {
    const routes = this.inventory();
    const problems: string[] = [];
    for (const r of routes) {
      if (r.policy === 'none') problems.push(`${r.method} ${r.path} (${r.handler}) declares no access policy`);
      for (const p of r.permissions) {
        if (!isKnownPermission(p)) problems.push(`${r.method} ${r.path} (${r.handler}) requires unknown capability ${p}`);
      }
    }
    if (problems.length) {
      throw new Error(`Access policy check failed:\n  ${problems.join('\n  ')}`);
    }
    const synced = await this.rbac.syncCatalog();
    this.logger.log(
      `Access policy OK — ${routes.length} routes; catalogue synced (${synced.permissions} capabilities, ${synced.roles} system roles)`,
    );
  }
}
