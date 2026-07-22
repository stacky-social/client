'use client';

import {useState} from 'react';
import { Text, Button, TextInput, Center, Container, Paper, Divider, Stack } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useRouter } from 'next/navigation';
import { CrossweaveLogo } from '../components/NavBar/CrossweaveLogo';
import classes from './LandingPage.module.css';
import {BASE_URL} from "../utils/DevMode";
import { prepareForMastodonLogin, startStudySession } from "../utils/studyMode";



interface FormValues {
  instanceDomain: string;
}

const redirectUri = `${BASE_URL}/callback`;
const scopes = 'read write follow';

export default function LandingPage() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const form = useForm<FormValues>({
    initialValues: {
      instanceDomain: '',
    },
    validate: {
      instanceDomain: (value) =>
          /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value)
              ? null
              : 'Please enter a valid instance domain, e.g., mastodon.social or beta.stacky.social',
    },
  });

  const handleLogin = () => {
    prepareForMastodonLogin();
    setIsLoading(true);
    notifications.show({
      title: 'Logging in',
      message: 'Attempting to Login to Mastodon...',
    });
    const clientId = process.env.NEXT_PUBLIC_MASTODON_OAUTH_CLIENT_ID;
    const instanceUrl = `https://${form.values.instanceDomain}`;
    const authorizationUrl = `${instanceUrl}/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scopes}&state=${form.values.instanceDomain}`;
    console.log("Authorization URL:", authorizationUrl);
    window.location.href = authorizationUrl;
  };

  const handleStartStudy = () => {
    startStudySession();
    router.push('/home');
  };


  return (
    <>
      <Center className={classes.landingPageContent}>
        <Container size={460} className={classes.container}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
            <CrossweaveLogo height={56} />
          </div>
          <Text c="dimmed" ta="center" size="md" className={classes.subtitle}>
            AI-Curated Democratic Discourse
          </Text>

          <Paper radius="lg" p="xl" withBorder className={classes.paper}>
            <Stack gap="sm">
              <Text size="xl" fw={700} ta="center">
                Explore CrossWeave
              </Text>
              <Text size="sm" c="dimmed" ta="center">
                Start with a fresh participant profile. No account or password is required.
              </Text>
              <Button
                type="button"
                fullWidth
                size="md"
                mt="sm"
                radius="xl"
                color="teal"
                onClick={handleStartStudy}
                data-testid="start-study-session"
              >
                Start study session
              </Button>
            </Stack>

            <Divider label="or" labelPosition="center" my="xl" />

            <Text size="sm" fw={600} ta="center" mb="md" c="dimmed">
              Continue with a Mastodon account
            </Text>

            <form onSubmit={form.onSubmit(handleLogin)}>
              <TextInput
                required
                radius="lg"
                label="Mastodon Instance"
                placeholder="instance domain"
                {...form.getInputProps('instanceDomain')}
              />
              <Button type="submit" fullWidth loading={isLoading} mt="lg" radius="xl" color="gray" variant="light">
                Continue with Mastodon
              </Button>
            </form>
          </Paper>
        </Container>
      </Center>
    </>
  );
}
