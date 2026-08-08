/**
 * Express Request augmentation for the user-service.
 * Extends req.userId and req.user set by @streamify/shared-middleware authenticate.
 */

import type { JwtPayload } from '@streamify/shared-types';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      user?: JwtPayload;
    }
  }
}
