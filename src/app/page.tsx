'use client';

import { useState } from 'react';
import { Title, Text, Button, TextInput, Box, Center, Container, rem } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useRouter } from 'next/navigation';
import { Header } from '../components/Header/Header';
import { Footer } from '../components/Footer/Footer';
import classes from './LandingPage.module.css';

interface FormValues {
  username: string;
}

const redirectUri = 'http://localhost:3000/callback';
const scopes = 'read write follow';

export default function LandingPage() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const form = useForm<FormValues>({
    initialValues: {
      username: '',
    },
    validate: {
      username: (value) =>
          /^[a-zA-Z0-9_]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value)
              ? null
              : 'please enter valid Mastodon handle (username@server)',
    },
  });

  const handleLogin = () => {
    setIsLoading(true);
    notifications.show({
      title: 'Logging in',
      message: 'Attempting to Login to Mastodon...',
    });
    const clientId = process.env.NEXT_PUBLIC_MASTODON_OAUTH_CLIENT_ID;
    const instanceUrl = `https://${form.values.username.split('@')[1]}`;
    const authorizationUrl = `${instanceUrl}/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scopes}&state=${form.values.username.split('@')[1]}`;
    window.location.href = authorizationUrl;
  };

  return (
      <>
        <Header />
        <Center className={classes.landingPageContent}>
          <Container maw={700}>
            <Text ta="center" mt={10} size={rem(75)} fw="900">
              Project{' '}
              <Text component="span" variant="gradient" gradient={{from: 'pink', to: 'yellow'}} inherit>
                STACKS
              </Text>
            </Text>
            <Text c="dimmed" ta="center" size="lg" maw={580} mt="xl" mb="lg">
              AI-Curated Democratic Discourse
            </Text>
            <Container w="80%">
              <form onSubmit={form.onSubmit(handleLogin)}>
                <TextInput
                    required
                    label="Mastodon Handle"
                    placeholder="username@server"
                    {...form.getInputProps('username')}
                />
                <Button type="submit" fullWidth loading={isLoading} mt="2rem">
                  Login
                </Button>
              </form>
            </Container>
          </Container>
        </Center>
        <Footer/>
      </>
  );
}
