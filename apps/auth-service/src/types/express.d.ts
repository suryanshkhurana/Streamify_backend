/**
 * Express + Passport type augmentation for the auth-service.
 *
 * Design:
 *   req.user    — Set by @types/passport as Express.User.
 *                 We keep Express.User = OAuthUser shape (id, email, displayName, plan)
 *                 which is what the Passport verify callback provides.
 *   req.userId  — Set by our authenticate middleware from the JWT sub claim.
 *   req.jwtUser — Set by our authenticate middleware with the full JwtPayload.
 *   req.oauthUser — Set by the Passport callback middleware for the OAuth redirect
 *                   flow; same shape as Express.User but named distinctly for clarity.
 */

import type { JwtPayload } from '@streamify/shared-types';

declare global {
  namespace Express {
    /**
     * Shape of req.user as set by the Passport Google Strategy verify callback.
     * This is intentionally different from JwtPayload — the Passport verify
     * callback doesn't have iat/exp yet.
     */
    interface User {
      id: string;
      email: string;
      displayName: string;
      plan: string;
    }

    interface Request {
      /** Set by the authenticate middleware — raw userId from JWT sub claim. */
      userId?: string;
      /**
       * Full decoded JWT payload set by the authenticate middleware.
       * Named jwtUser to avoid the conflict with Express.User (Passport's req.user).
       */
      jwtUser?: JwtPayload;
      /**
       * Set by the inline Passport callback middleware in auth.routes.ts.
       * Same shape as Express.User; named distinctly for clarity.
       */
      oauthUser?: {
        id: string;
        email: string;
        displayName: string;
        plan: string;
      };
    }
  }
}

export {};
