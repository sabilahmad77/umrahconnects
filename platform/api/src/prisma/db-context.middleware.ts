import { Injectable, NestMiddleware } from '@nestjs/common';
import { runWithDbContext } from './db-context';

/**
 * Opens an empty database context for every request. It carries no scope until
 * JwtAuthGuard binds the authenticated principal, so public routes see no
 * tenant-private rows unless their code explicitly enters system scope.
 */
@Injectable()
export class DbContextMiddleware implements NestMiddleware {
  use(req: { requestId?: string }, _res: unknown, next: (error?: unknown) => void) {
    runWithDbContext({ requestId: req.requestId }, () => next());
  }
}
