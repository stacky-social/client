'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { notifications } from '@mantine/notifications';
import {Center, Container, Loader} from "@mantine/core";

const clientId = process.env.NEXT_PUBLIC_MASTODON_OAUTH_CLIENT_ID;
const clientSecret = process.env.NEXT_PUBLIC_MASTODON_OAUTH_CLIENT_SECRET;
const redirectUri = 'http://localhost:3000/callback';

export default function Callback() {
    const router = useRouter();
    const searchParams = useSearchParams();

    useEffect(() => {
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

            // 获取用户信息
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
              router.push('/home'); // 导航到/home页面
            } else {
              console.error('Failed to fetch user info:', userData);
              notifications.show({
                title: 'Error',
                message: 'Failed to fetch user info.',
                color: 'red',
              });
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
        }
      };

      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const instance = `https://${state}`;

      if (code) {
        fetchAccessToken(code, instance);
      }
    }, [searchParams, router]);

    return (
      <Center>
        <Loader color="blue" size={41} my={45}/>
      </Center>
    );
  }
