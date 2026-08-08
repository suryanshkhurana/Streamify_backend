/**
 * Auth Controller â€” HTTP layer.
 *
 * Responsibilities:
 *  - Extract and validate request inputs
 *  - Call the auth service
 *  - Set / clear the httpOnly refresh-token cookie
 *  - Send standardised JSON responses
 *
 * Cookie strategy:
 *   Name:     streamify_rt
 *   httpOnly: true  â€” inaccessible to JavaScript (XSS protection)
 *   secure:   true  â€” HTTPS only in production
 *   sameSite: strict â€” CSRF protection
 *   maxAge:   7 days (604800 seconds)
 *   path:     /auth  â€” only sent to auth-service endpoints
 */

import type { CookieOptions, Request, RequestHandler, Response } from 'express';

import { AppError, catchAsync } from '@streamify/shared-middleware';
import type { ApiSuccess, TokenPair } from '@streamify/shared-types';

import * as authService from '../services/auth.service.js';
import { REFRESH_TOKEN_TTL_SECONDS } from '../utils/tokens.js';
import type {
  GoogleOAuthInput,
  LoginInput,
  RegisterInput,
} from '../validators/auth.validators.js';

// â”€â”€â”€ Cookie config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const REFRESH_COOKIE_NAME = 'streamify_rt';

function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'strict',
    maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000, // ms
    path: '/',
  };
}

function clearCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'strict',
    path: '/',
  };
}

// â”€â”€â”€ Meta extraction â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function extractMeta(req: Request): { userAgent?: string; ipAddress?: string } {
  return {
    userAgent: req.headers['user-agent'],
    ipAddress:
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      req.socket.remoteAddress,
  };
}

// â”€â”€â”€ Controllers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * POST /auth/register
 * Body: { email, password, displayName }
 * Response: 201 { success, data: { accessToken, user } }
 * Cookie: streamify_rt (httpOnly)
 */
export const registerController: RequestHandler = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const input = req.body as RegisterInput;
    const meta = extractMeta(req);

    const result = await authService.register(input, meta);

    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, refreshCookieOptions());

    const body: ApiSuccess<{ accessToken: string; user: typeof result.user }> = {
      success: true,
      data: {
        accessToken: result.accessToken,
        user: result.user,
      },
      message: 'Account created successfully',
    };

    res.status(201).json(body);
  },
);

/**
 * POST /auth/login
 * Body: { email, password }
 * Response: 200 { success, data: { accessToken, user } }
 * Cookie: streamify_rt (httpOnly)
 */
export const loginController: RequestHandler = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const input = req.body as LoginInput;
    const meta = extractMeta(req);

    const result = await authService.login(input, meta);

    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, refreshCookieOptions());

    const body: ApiSuccess<{ accessToken: string; user: typeof result.user }> = {
      success: true,
      data: {
        accessToken: result.accessToken,
        user: result.user,
      },
      message: 'Logged in successfully',
    };

    res.status(200).json(body);
  },
);

/**
 * POST /auth/oauth/google
 * Body: { code, redirectUri }
 * Response: 200 { success, data: { accessToken, user } }
 * Cookie: streamify_rt (httpOnly)
 */
export const googleOAuthController: RequestHandler = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const input = req.body as GoogleOAuthInput;
    const meta = extractMeta(req);

    const result = await authService.googleOAuth(input, meta);

    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, refreshCookieOptions());

    const body: ApiSuccess<{ accessToken: string; user: typeof result.user }> = {
      success: true,
      data: {
        accessToken: result.accessToken,
        user: result.user,
      },
      message: 'Logged in with Google successfully',
    };

    res.status(200).json(body);
  },
);

/**
 * POST /auth/refresh
 * Cookie: streamify_rt (httpOnly)
 * Response: 200 { success, data: { accessToken } }
 * Cookie: streamify_rt (rotated, httpOnly)
 */
export const refreshController: RequestHandler = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const tokenId: string | undefined = (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE_NAME];

    if (!tokenId) {
      throw AppError.unauthorised('Refresh token cookie is missing');
    }

    const meta = extractMeta(req);
    const result = await authService.refreshTokens(tokenId, meta);

    // Rotate cookie â€” old token is now revoked
    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, refreshCookieOptions());

    const body: ApiSuccess<TokenPair & { user: typeof result.user }> = {
      success: true,
      data: {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken, // also in response for debugging
        user: result.user,
      },
    };

    res.status(200).json(body);
  },
);

/**
 * POST /auth/logout
 * Cookie: streamify_rt (httpOnly)
 * Response: 200 { success, message }
 *
 * Idempotent â€” safe to call even if already logged out.
 */
export const logoutController: RequestHandler = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const tokenId: string | undefined = (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE_NAME];

    if (tokenId) {
      await authService.logout(tokenId);
    }

    res.clearCookie(REFRESH_COOKIE_NAME, clearCookieOptions());

    const body: ApiSuccess<null> = {
      success: true,
      data: null,
      message: 'Logged out successfully',
    };

    res.status(200).json(body);
  },
);

/**
 * POST /auth/logout/all  (requires authenticate middleware)
 * Header: Authorization: Bearer <access_token>
 * Cookie: streamify_rt (httpOnly)
 * Response: 200 { success, message }
 *
 * Revokes all refresh tokens for the user (signs out from all devices).
 */
export const logoutAllController: RequestHandler = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.userId) {
      throw AppError.unauthorised('Authentication required');
    }

    await authService.logoutAll(req.userId);

    res.clearCookie(REFRESH_COOKIE_NAME, clearCookieOptions());

    const body: ApiSuccess<null> = {
      success: true,
      data: null,
      message: 'Logged out from all devices successfully',
    };

    res.status(200).json(body);
  },
);

/**
 * GET /auth/me  (requires authenticate middleware)
 * Header: Authorization: Bearer <access_token>
 * Response: 200 { success, data: { userId, email, displayName } }
 *
 * Lightweight endpoint for the frontend to verify the access token is still valid
 * and retrieve the decoded payload.
 */
export const meController: RequestHandler = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.userId) {
      throw AppError.unauthorised('Authentication required');
    }

    // req.user is set by the shared-middleware authenticate() as a JwtPayload.
    // Cast via unknown since Express.User (from @types/passport) differs from JwtPayload.
    const jwtPayload = req.user as unknown as { sub: string; email: string; displayName: string } | undefined;

    const body: ApiSuccess<{ userId: string; email: string; displayName: string }> = {
      success: true,
      data: {
        userId: req.userId,
        email: jwtPayload?.email ?? '',
        displayName: jwtPayload?.displayName ?? '',
      },
    };

    res.status(200).json(body);
  },
);

// --- Passport Google OAuth2 callback -----------------------------------------

/**
 * GET /auth/oauth/google/callback  (Passport redirect flow)
 *
 * Runs AFTER the inline Passport middleware in auth.routes.ts has verified the
 * Google profile and stored the upserted user on req.oauthUser.
 *
 * Steps:
 *  1. Read req.oauthUser (set by the Passport authenticate middleware)
 *  2. Issue access + refresh tokens via authService.createSession()
 *  3. Set the httpOnly refresh-token cookie
 *  4. Redirect the browser to FRONTEND_URL/auth/callback?accessToken=...
 *
 * Security note:
 *  The access token is placed in the query string only because there is no
 *  other mechanism to pass data from a server-side redirect to a SPA.
 *  The token is short-lived (15 min). The SPA MUST read and move it into
 *  memory (Zustand) immediately, then call history.replaceState() to strip
 *  it from the URL bar.
 */
export const googlePassportCallbackController: RequestHandler = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const user = req.oauthUser;

    const frontendUrl =
      process.env['FRONTEND_URL'] ??
      process.env['CORS_ORIGIN'] ??
      'http://localhost:5173';

    // oauthUser missing means the Passport middleware already sent an error
    // redirect — this branch is only reachable via route misconfiguration.
    if (!user) {
      res.redirect(`${frontendUrl}/login?error=oauth_failed`);
      return;
    }

    const meta = extractMeta(req);
    const { accessToken, refreshToken } = await authService.createSession(user, meta);

    // Set long-lived refresh token as httpOnly cookie
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());

    // Redirect browser to the SPA with the short-lived access token
    const redirectUrl = new URL('/auth/callback', frontendUrl);
    redirectUrl.searchParams.set('accessToken', accessToken);

    res.redirect(302, redirectUrl.toString());
  },
);



