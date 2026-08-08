/**
 * src/types/express.d.ts
 *
 * Re-declares the Express Request augmentation so TypeScript knows
 * req.userId and req.user exist after the authenticate middleware runs.
 *
 * This mirrors the declaration in @streamify/shared-middleware/src/types/express.d.ts
 */

import type { JwtPayload } from '@streamify/shared-types';

declare global {
  namespace Express {
    interface Request {
      /** Authenticated user's ID (sub claim from JWT). Set by authenticate middleware. */
      userId?: string;
      /** Full decoded JWT payload. Set by authenticate middleware. */
      user?: JwtPayload;
    }
  }
}

export {};
