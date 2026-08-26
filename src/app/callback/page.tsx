'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { Anchor, Button, Loader, Text } from '@mantine/core';
import { IconAlertCircle, IconCheck } from '@tabler/icons-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { notifications } from '@mantine/notifications';
import { CrossweaveLogo } from '../../components/NavBar/CrossweaveLogo';
import classes from './Callback.module.css';

type CallbackState = 'loading' | 'success' | 'error';

function CallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasProcessedRef = useRef(false);
  const [status, setStatus] = useState<CallbackState>('loading');
  const [message, setMessage] = useState('Confirming your CrossWeave account…');

  useEffect(() => {
    if (hasProcessedRef.current) return;
    hasProcessedRef.current = true;

    const code = searchParams.get('code');
    const state = searchParams.get('state');
    if (!code || !state) {
      setStatus('error');
      setMessage('The login response was incomplete. Please start again.');
      return;
    }

    if (localStorage.getItem('accessToken')) {
      router.replace('/home');
      return;
    }

    const finishLogin = async () => {
      try {
        const response = await fetch('/api/auth/mastodon/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, state }),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.accessToken || !data?.account) {
          throw new Error(data?.error || 'Login could not be completed.');
        }

        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('currentUser', JSON.stringify(data.account));
        localStorage.setItem('mastodonInstance', data.instance);
        const accountName = data.account.display_name || `@${data.account.acct}`;
        setStatus('success');
        setMessage(`Signed in as ${accountName}`);
        notifications.show({ title: 'Welcome to CrossWeave', message: `Signed in as @${data.account.acct}.`, color: 'green' });
        const timeout = window.setTimeout(() => router.replace('/home'), 500);
        return () => window.clearTimeout(timeout);
      } catch (error) {
        console.error('Mastodon login failed:', error);
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'Login could not be completed.');
      }
    };

    void finishLogin();
  }, [router, searchParams]);

  return (
    <main className={classes.page}>
      <section className={classes.card} aria-live="polite">
        <CrossweaveLogo height={34} />
        <div className={classes.statusIcon} data-status={status}>
          {status === 'loading' && <Loader size={30} color="blue" />}
          {status === 'success' && <IconCheck size={32} aria-hidden="true" />}
          {status === 'error' && <IconAlertCircle size={32} aria-hidden="true" />}
        </div>
        <h1>{status === 'loading' ? 'Signing you in' : status === 'success' ? 'You’re signed in' : 'Login failed.'}</h1>
        <Text className={classes.message}>{message}</Text>
        {status === 'error' && (
          <div className={classes.actions}>
            <Button component="a" href="/api/auth/mastodon/start" color="dark">Try again</Button>
            <Anchor href="/">Back to login</Anchor>
          </div>
        )}
      </section>
    </main>
  );
}
export default function Callback() {
  return (
    <Suspense fallback={<main className={classes.page}><Loader /></main>}>
      <CallbackPage />
    </Suspense>
  );
}
