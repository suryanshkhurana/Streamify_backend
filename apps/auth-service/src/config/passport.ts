/**
 * Passport.js configuration — Google OAuth2 strategy.
 *
 * Flow (server-side redirect, not SPA code-exchange):
 *  1. Browser hits GET /auth/oauth/google
 *     → passport.authenticate() redirects to Google consent page
 *  2. Google redirects to GET /auth/oauth/google/callback?code=...
 *     → Passport exchanges the code for tokens internally
 *     → Calls the verify function with the user's Google profile
 *     → verify calls upsertGoogleUser() to find-or-create the Streamify user
 *  3. The callback controller reads req.oauthUser, issues JWT + refresh token,
 *     sets the httpOnly cookie, and redirects the browser to the SPA.
 *
 * Note: session: false is used on all authenticate calls because Streamify
 * is stateless (JWTs + Redis). passport.initialize() is the only session
 * middleware needed.
 */

import passport from 'passport';
import {
  Strategy as GoogleStrategy,
  type Profile,
  type VerifyCallback,
} from 'passport-google-oauth20';

import { logger } from '@streamify/shared-middleware';

import { upsertGoogleUser } from '../services/auth.service.js';

// ─── Google Strategy ──────────────────────────────────────────────────────────

function verifyGoogleProfile(
  _accessToken: string,
  _refreshToken: string,
  profile: Profile,
  done: VerifyCallback,
): void {
  upsertGoogleUser(profile)
    .then((user) => {
      done(null, user);
    })
    .catch((err: Error) => {
      logger.error({ err, googleId: profile.id }, '[passport] Google strategy error');
      done(err);
    });
}

export function configurePassport(): void {
  const clientID = process.env['GOOGLE_CLIENT_ID'];
  const clientSecret = process.env['GOOGLE_CLIENT_SECRET'];

  if (!clientID || !clientSecret) {
    logger.warn('[passport] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set — Google OAuth disabled');
    return;
  }

  const callbackURL =
    process.env['GOOGLE_CALLBACK_URL'] ??
    'http://localhost:3001/auth/oauth/google/callback';

  passport.use(
    new GoogleStrategy(
      {
        clientID,
        clientSecret,
        callbackURL,
        scope: ['profile', 'email'],
        // Passes the access_token / refresh_token to the verify callback
        passReqToCallback: false,
      },
      verifyGoogleProfile,
    ),
  );

  // serializeUser / deserializeUser are required by Passport even when
  // session: false — without them, calling passport.initialize() emits a warning.
  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((user, done) => done(null, user as Express.User));

  logger.info('[passport] Google OAuth2 strategy registered');
}
