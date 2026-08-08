/**
 * Auth Router — maps HTTP routes to controllers.
 *
 * Route map:
 *   POST   /auth/register                  Register with email + password
 *   POST   /auth/login                     Login with email + password
 *   POST   /auth/oauth/google              SPA code-exchange flow (googleapis)
 *   GET    /auth/oauth/google              Redirect-based flow: send browser to Google
 *   GET    /auth/oauth/google/callback     Redirect-based flow: handle Google callback
 *   POST   /auth/refresh                   Rotate refresh token (cookie → new cookie)
 *   POST   /auth/logout                    Logout from current device
 *   POST   /auth/logout/all               Logout from all devices (requires JWT)
 *   GET    /auth/me                        Validate access token + return decoded claims
 */

import { type NextFunction, type Request, type Response, type Router, Router as ExpressRouter } from 'express';
import passport from 'passport';

import { authenticate, validate } from '@streamify/shared-middleware';

import {
  googleOAuthController,
  googlePassportCallbackController,
  loginController,
  logoutAllController,
  logoutController,
  meController,
  refreshController,
  registerController,
} from '../controllers/auth.controller.js';
import type { OAuthUser } from '../services/auth.service.js';
import {
  GoogleOAuthSchema,
  LoginSchema,
  RegisterSchema,
} from '../validators/auth.validators.js';

const router: Router = ExpressRouter();

// ─── Public routes ────────────────────────────────────────────────────────────

/** POST /auth/register */
router.post('/register', validate(RegisterSchema), registerController);

/** POST /auth/login */
router.post('/login', validate(LoginSchema), loginController);

/**
 * POST /auth/oauth/google
 * SPA code-exchange flow: the frontend obtains the auth code from Google
 * (e.g. via @react-oauth/google) and sends it here for exchange.
 */
router.post('/oauth/google', validate(GoogleOAuthSchema), googleOAuthController);

/**
 * GET /auth/oauth/google
 * Passport redirect flow: redirects the browser to Google's consent page.
 * Used when the login button triggers a full-page navigation (non-SPA mode).
 */
router.get(
  '/oauth/google',
  passport.authenticate('google', {
    session: false,
    scope: ['profile', 'email'],
    prompt: 'select_account',
  }),
);

/**
 * GET /auth/oauth/google/callback
 * Google redirects here after the user grants (or denies) consent.
 *
 * Pattern: custom Passport callback middleware → googlePassportCallbackController
 *
 * The inline middleware:
 *  - Calls passport.authenticate with a custom callback (avoids setting req.user)
 *  - On success: stores the upserted user on req.oauthUser, calls next()
 *  - On error/deny: redirects browser to FRONTEND_URL/login?error=oauth_failed
 */
router.get(
  '/oauth/google/callback',
  (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate(
      'google',
      { session: false },
      (err: Error | null, user: OAuthUser | false) => {
        if (err) {
          // Strategy-level error (e.g. network failure, invalid code)
          next(err);
          return;
        }

        if (!user) {
          // User denied access or Google returned no profile
          const frontendUrl =
            process.env['FRONTEND_URL'] ??
            process.env['CORS_ORIGIN'] ??
            'http://localhost:5173';
          res.redirect(`${frontendUrl}/login?error=oauth_denied`);
          return;
        }

        // Attach the upserted user for the next controller
        req.oauthUser = user;
        next();
      },
    )(req, res, next);
  },
  googlePassportCallbackController,
);

/** POST /auth/refresh — reads httpOnly cookie, rotates token */
router.post('/refresh', refreshController);

/** POST /auth/logout — revokes current device session */
router.post('/logout', logoutController);

// ─── Protected routes (require valid access token) ────────────────────────────

/** POST /auth/logout/all — revokes all sessions for the user */
router.post('/logout/all', authenticate, logoutAllController);

/** GET /auth/me — verifies access token and returns decoded claims */
router.get('/me', authenticate, meController);

export default router;
