import { NextRequest, NextResponse } from 'next/server';
import { MASTODON_INSTANCE_URL, type MastodonAccount } from '../../../../../utils/mastodonApi';

export const dynamic = 'force-dynamic';

const OAUTH_STATE_COOKIE = 'crossweave_oauth_state';
const OAUTH_REDIRECT_COOKIE = 'crossweave_oauth_redirect';

interface CallbackBody {
  code?: string;
  state?: string;
}

function clearOAuthCookies(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store');
  response.cookies.set(OAUTH_STATE_COOKIE, '', { path: '/', maxAge: 0 });
  response.cookies.set(OAUTH_REDIRECT_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}

export async function POST(request: NextRequest) {
  let body: CallbackBody;
  try {
    body = await request.json() as CallbackBody;
  } catch {
    return NextResponse.json({ error: 'Invalid callback request.' }, { status: 400 });
  }

  const expectedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  const redirectUri = request.cookies.get(OAUTH_REDIRECT_COOKIE)?.value;
  if (!body.code || !body.state || !expectedState || body.state !== expectedState || !redirectUri) {
    return clearOAuthCookies(
      NextResponse.json({ error: 'This login attempt is invalid or has expired.' }, { status: 400 }),
    );
  }

  const clientId = process.env.NEXT_PUBLIC_MASTODON_OAUTH_CLIENT_ID;
  // The fallback keeps existing deployments working during the environment
  // variable migration. It is deliberately referenced only in this server route.
  const clientSecret = process.env.MASTODON_OAUTH_CLIENT_SECRET
    || process.env.NEXT_PUBLIC_MASTODON_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return clearOAuthCookies(
      NextResponse.json({ error: 'Mastodon login is not configured.' }, { status: 503 }),
    );
  }

  try {
    const tokenResponse = await fetch(`${MASTODON_INSTANCE_URL}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code: body.code,
        scope: 'read write follow',
      }),
      cache: 'no-store',
    });
    const tokenData = await tokenResponse.json().catch(() => null) as { access_token?: string; error?: string } | null;
    if (!tokenResponse.ok || !tokenData?.access_token) {
      return clearOAuthCookies(
        NextResponse.json({ error: 'Mastodon rejected this login attempt.' }, { status: 401 }),
      );
    }

    const accountResponse = await fetch(`${MASTODON_INSTANCE_URL}/api/v1/accounts/verify_credentials`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
      cache: 'no-store',
    });
    const account = await accountResponse.json().catch(() => null) as MastodonAccount | null;
    if (!accountResponse.ok || !account?.id) {
      return clearOAuthCookies(
        NextResponse.json({ error: 'Your account could not be verified.' }, { status: 401 }),
      );
    }

    return clearOAuthCookies(NextResponse.json({
      accessToken: tokenData.access_token,
      account,
      instance: MASTODON_INSTANCE_URL,
    }));
  } catch (error) {
    console.error('Mastodon OAuth callback failed:', error);
    return clearOAuthCookies(
      NextResponse.json({ error: 'Mastodon is unavailable. Please try again.' }, { status: 502 }),
    );
  }
}
