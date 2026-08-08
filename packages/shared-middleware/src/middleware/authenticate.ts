import type { JwtPayload } from '@streamify/shared-types';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';


import { AppError } from '../errors/AppError.js';
// ─── Type augmentation ────────────────────────────────────────────────────────
// Types are automatically picked up via tsconfig include array

/**
 * authenticate — JWT verification middleware.
 *
 * Reads the `Authorization: Bearer <token>` header, verifies the token
 * against JWT_SECRET, and attaches the decoded claims to:
 *   - `req.userId`  (string — the `sub` claim)
 *   - `req.user`    (JwtPayload — full decoded payload)
 *
 * Throws a 401 AppError if:
 *   - No Authorization header is present
 *   - Header is not in `Bearer <token>` format
 *   - Token is invalid, expired, or tampered with
 *   - JWT_SECRET env var is not set (configuration error → 500)
 *
 * Usage — protect a single route:
 * ```ts
 * router.get('/me', authenticate, catchAsync(async (req, res) => {
 *   const user = await userService.findById(req.userId!);
 *   res.json({ success: true, data: user });
 * }));
 * ```
 *
 * Usage — protect all routes in a router:
 * ```ts
 * router.use(authenticate);
 * ```
 */
export const authenticate = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  try {
    // ── 1. Extract the token ───────────────────────────────────────────────
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
      throw AppError.unauthorised('No authorisation token provided');
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw AppError.unauthorised(
        'Authorisation header must be in format: Bearer <token>',
      );
    }

    const token = authHeader.slice(7).trim();

    if (!token) {
      throw AppError.unauthorised('Token is empty');
    }

    // ── 2. Verify JWT_SECRET is configured ────────────────────────────────
    const secret = process.env['JWT_SECRET'];
    if (!secret) {
      // Programming error — not a user-facing issue
      throw AppError.internal('JWT_SECRET environment variable is not set');
    }

    // ── 3. Verify + decode ────────────────────────────────────────────────
    const decoded = jwt.verify(token, secret) as JwtPayload;

    // ── 4. Attach to request ──────────────────────────────────────────────
    req.userId = decoded.sub;
    req.user = decoded;

    next();
  } catch (err) {
    // jsonwebtoken throws named errors — globalErrorHandler remaps them to 401
    next(err);
  }
};

/**
 * optionalAuthenticate — same as authenticate but does NOT reject unauthenticated
 * requests. Instead, sets req.userId / req.user only when a valid token is present.
 *
 * Use on public routes that have slightly different behaviour for logged-in users
 * (e.g. personalised recommendations, liked-song indicators).
 */
export const optionalAuthenticate = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const authHeader = req.headers['authorization'];

  if (!authHeader?.startsWith('Bearer ')) {
    // No token — continue as unauthenticated
    return next();
  }

  const token = authHeader.slice(7).trim();
  const secret = process.env['JWT_SECRET'];

  if (!secret || !token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, secret) as JwtPayload;
    req.userId = decoded.sub;
    req.user = decoded;
  } catch {
    // Invalid token on an optional route — silently ignore, continue as anonymous
  }

  next();
};
