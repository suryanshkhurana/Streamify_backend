/**
 * Google OAuth2 client configuration.
 *
 * Flow:
 *  1. Frontend redirects user to Google's OAuth2 consent page
 *     (URL built by the browser using GOOGLE_CLIENT_ID + GOOGLE_REDIRECT_URI)
 *  2. Google redirects back to the frontend with `?code=...`
 *  3. Frontend POSTs `{ code, redirectUri }` to POST /auth/oauth/google
 *  4. auth-service exchanges the code for tokens → fetches user profile
 *  5. auth-service finds or creates the Streamify user, issues tokens
 */

import { google, type Auth } from 'googleapis';

// ─── Singleton ────────────────────────────────────────────────────────────────

let oAuth2Client: Auth.OAuth2Client | null = null;

export function getOAuth2Client(): Auth.OAuth2Client {
  if (oAuth2Client) { return oAuth2Client; }

  const clientId = process.env['GOOGLE_CLIENT_ID'];
  const clientSecret = process.env['GOOGLE_CLIENT_SECRET'];

  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set');
  }

  oAuth2Client = new google.auth.OAuth2(clientId, clientSecret);
  return oAuth2Client;
}

// ─── Profile fetcher ─────────────────────────────────────────────────────────

export interface GoogleUserProfile {
  googleId: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  emailVerified: boolean;
}

/**
 * Exchanges an authorisation code for tokens, then fetches the user's Google profile.
 *
 * @param code        - The authorisation code received from Google's callback.
 * @param redirectUri - Must match the one registered in Google Cloud Console.
 * @returns Normalised Google user profile.
 */
export async function getGoogleProfile(
  code: string,
  redirectUri: string,
): Promise<GoogleUserProfile> {
  const client = getOAuth2Client();

  // Exchange the auth code for access + id tokens
  const { tokens } = await client.getToken({ code, redirect_uri: redirectUri });
  client.setCredentials(tokens);

  // Fetch the authenticated user's profile
  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const { data } = await oauth2.userinfo.get();

  if (!data.id || !data.email) {
    throw new Error('Google did not return a user ID or email');
  }

  return {
    googleId: data.id,
    email: data.email.toLowerCase(),
    displayName: data.name ?? data.email.split('@')[0],
    avatarUrl: data.picture ?? undefined,
    emailVerified: data.verified_email ?? false,
  };
}
