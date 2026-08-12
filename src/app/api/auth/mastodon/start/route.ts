import { NextRequest, NextResponse } from 'next/server';
import { MASTODON_INSTANCE_URL } from '../../../../../utils/mastodonApi';
import { mastodonOAuthRedirectUri } from '../../../../../utils/oauthRedirect.mjs';

export const dynamic = 'force-dynamic';

const OAUTH_STATE_COOKIE = 'crossweave_oauth_state';
const OAUTH_REDIRECT_COOKIE = 'crossweave_oauth_redirect';
const OAUTH_SCOPES = 'read write follow';

export async function GET(request: NextRequest) {
  const clientId = process.env.NEXT_PUBLIC_MASTODON_OAUTH_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: 'Mastodon login is not configured.' },
      { status: 503 },
    );
  }

  const state = crypto.randomUUID();
  const redirectUri = mastodonOAuthRedirectUri({
    requestOrigin: request.nextUrl.origin,
    configuredOrigin: process.env.OAUTH_REDIRECT_ORIGIN,
  });
  const authorizationUrl = new URL('/oauth/authorize', MASTODON_INSTANCE_URL);
  authorizationUrl.searchParams.set('client_id', clientId);
  authorizationUrl.searchParams.set('redirect_uri', redirectUri);
  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('scope', OAUTH_SCOPES);
  authorizationUrl.searchParams.set('state', state);

  const response = NextResponse.redirect(authorizationUrl);
  response.headers.set('Cache-Control', 'no-store');
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 10 * 60,
  };
  response.cookies.set(OAUTH_STATE_COOKIE, state, cookieOptions);
  response.cookies.set(OAUTH_REDIRECT_COOKIE, redirectUri, cookieOptions);
  return response;
}
