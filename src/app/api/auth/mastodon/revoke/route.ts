import { NextRequest, NextResponse } from 'next/server';
import { MASTODON_INSTANCE_URL } from '../../../../../utils/mastodonApi';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  const token = authorization?.replace(/^Bearer\s+/i, '').trim();
  const clientId = process.env.NEXT_PUBLIC_MASTODON_OAUTH_CLIENT_ID;
  const clientSecret = process.env.MASTODON_OAUTH_CLIENT_SECRET
    || process.env.NEXT_PUBLIC_MASTODON_OAUTH_CLIENT_SECRET;

  if (!token) return NextResponse.json({ error: 'No token supplied.' }, { status: 400 });
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Mastodon login is not configured.' }, { status: 503 });
  }

  try {
    const response = await fetch(`${MASTODON_INSTANCE_URL}/oauth/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, token }),
      cache: 'no-store',
    });
    if (!response.ok) {
      return NextResponse.json({ error: 'Mastodon did not revoke this session.' }, { status: 502 });
    }
    return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Mastodon token revocation failed:', error);
    return NextResponse.json({ error: 'Mastodon is unavailable.' }, { status: 502 });
  }
}
