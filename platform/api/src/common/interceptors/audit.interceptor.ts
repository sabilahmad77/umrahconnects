import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from '../../modules/audit/audit.service';

// Automatically emits audit events for write operations (POST, PUT, PATCH, DELETE)
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, user, ip, headers } = request;

    const writeMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
    if (!writeMethods.includes(method)) return next.handle();

    return next.handle().pipe(
      tap({
        next: () => {
          if (!user?.sub) return;
          this.auditService
            .log({
              tenantId: user.tenantId,
              actorId: user.sub,
              actorEmail: user.email,
              action: this.methodToAction(method),
              namespace: this.extractNamespace(url),
              resource: this.extractResource(url),
              resourceId: this.extractResourceId(url),
              ipAddress: ip,
              userAgent: headers['user-agent'],
              requestId: headers['x-request-id'],
            })
            .catch((err) => this.logger.error(`Audit log failed: ${err.message}`));
        },
      }),
    );
  }

  private methodToAction(method: string): string {
    const map: Record<string, string> = {
      POST: 'CREATE',
      PUT: 'UPDATE',
      PATCH: 'UPDATE',
      DELETE: 'DELETE',
    };
    return map[method] ?? 'UPDATE';
  }

  private extractNamespace(url: string): string {
    // /api/v1/plugins/crm/pilgrims -> crm
    const match = url.match(/\/plugins\/([^/]+)/);
    return match?.[1] ?? 'core';
  }

  private extractResource(url: string): string {
    const parts = url.split('/').filter(Boolean);
    return parts[parts.length - 1] ?? url;
  }

  private extractResourceId(url: string): string | undefined {
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    return url.match(uuidRegex)?.[0];
  }
}
