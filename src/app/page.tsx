'use client';

import { useState } from 'react';
import { Title, Text, Button, TextInput, Box, Center } from '@mantine/core';
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
      username: (value) => (/^[a-zA-Z0-9_]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value) ? null : 'please enter valid Mastodon handle(username@server)'),
    },
  });

  const handleLogin = () => {
    setIsLoading(true);
    const clientId = process.env.NEXT_PUBLIC_MASTODON_OAUTH_CLIENT_ID;
    const instanceUrl = `https://${form.values.username.split('@')[1]}`;
    const authorizationUrl = `${instanceUrl}/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scopes}&state=${form.values.username.split('@')[1]}`;
    window.location.href = authorizationUrl;
  };

  return (
    <>
      <Header />
      <Center className={classes.landingPageContent}>
        <Box maw={400} mx="auto">
          <Title className={classes.title} ta="center" mt={60}>
            Project{' '}
            <Text inherit variant="gradient" component="span" gradient={{ from: 'pink', to: 'yellow' }}>
              STACKS
            </Text>
          </Title>
          <Text c="dimmed" ta="center" size="lg" maw={580} mx="auto" mt="xl">
            AI-Curated Democratic Discourse
          </Text>
          <form onSubmit={form.onSubmit(handleLogin)}>
            <TextInput
              required
              label="Mastodon Handle"
              placeholder="username@server"
              {...form.getInputProps('username')}
            />
            <Button type="submit" fullWidth mt="xl" loading={isLoading}>
              Login
            </Button>
          </form>
        </Box>
      </Center>
      <Footer />
    </>
  );
}
