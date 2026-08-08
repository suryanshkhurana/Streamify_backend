/**
 * Express Request type augmentation.
 * Adds `userId` and `user` fields set by the `authenticate` middleware.
 *
 * This file must be imported (directly or transitively) by any service
 * that uses the authenticate middleware, so the augmented types are in scope.
 */

import type { JwtPayload } from '@streamify/shared-types';

declare global {
  namespace Express {
    interface Request {
      /**
       * The authenticated user's ID (sub claim from JWT).
       * Set by the `authenticate` middleware. Undefined on unauthenticated routes.
       */
      userId?: string;
      /**
       * The full decoded JWT payload.
       * Set by the `authenticate` middleware. Undefined on unauthenticated routes.
       */
      user?: JwtPayload;
    }
  }
}

export {};
