'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { notifications } from '@mantine/notifications';
import { Anchor, Center, Loader, Stack, Text } from '@mantine/core';
import { Suspense } from 'react';
import {BASE_URL} from "../../utils/DevMode";

const clientId = process.env.NEXT_PUBLIC_MASTODON_OAUTH_CLIENT_ID;
const clientSecret = process.env.NEXT_PUBLIC_MASTODON_OAUTH_CLIENT_SECRET;

const redirectUri = `${BASE_URL}/callback`;

function CallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasProcessedRef = useRef(false);
  const [error, setError] = useState(false);


  useEffect(() => {
    if (hasProcessedRef.current) return;
    hasProcessedRef.current = true;

    const fetchAccessToken = async (code: string, instance: string) => {
      try {
        const response = await fetch(`${instance}/oauth/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
            code,
          }),
        });

        const data = await response.json();
        if (response.ok) {
          const accessToken = data.access_token;
          localStorage.setItem('accessToken', accessToken);

          // get user info
          const userResponse = await fetch(`${instance}/api/v1/accounts/verify_credentials`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });
          const userData = await userResponse.json();
          if (userResponse.ok) {
            localStorage.setItem('currentUser', JSON.stringify(userData));
            notifications.show({
              title: 'Success',
              message: 'Login successful. User info stored in localStorage.',
              color: 'green',
            });
            router.push('/home'); // direct to home page
          } else {
            console.error('Failed to fetch user info:', userData);
            notifications.show({
              title: 'Error',
              message: 'Failed to fetch user info.',
              color: 'red',
            });
            setError(true);
          }
        } else {
          console.error('Error response from token endpoint:', data);
          throw new Error(data.error || 'Unknown error');
        }
      } catch (error) {
        notifications.show({
          title: 'Error',
          message: 'Login failed.',
          color: 'red',
        });
        console.error('Error during token exchange:', error);
        setError(true);
      }
    };

    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const instance = `https://${state}`;
    console.log('Authorization code:', code);
    if (!code || !state) {
      setError(true);
      return;
    }
    if (localStorage.getItem('accessToken')) {
      router.push('/home');
      return;
    }
    fetchAccessToken(code, instance);
  }, [searchParams, router]);

  // On failure, send the user back to the login page after a short delay so
  // they aren't stranded on a stalled spinner. The "Back to login" link below
  // lets them leave immediately.
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => router.push('/'), 4000);
    return () => clearTimeout(t);
  }, [error, router]);

  if (error) {
    return (
      <Center my={45}>
        <Stack align="center" gap="xs">
          <Text fw={500}>Login failed.</Text>
          <Text size="sm" c="dimmed">Redirecting you to the login page…</Text>
          <Anchor href="/">Back to login</Anchor>
        </Stack>
      </Center>
    );
  }

  return (
    <Center>
      <Loader color="blue" size={41} my={45} />
    </Center>
  );
}

export default function Callback() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CallbackPage />
    </Suspense>
  );
}
