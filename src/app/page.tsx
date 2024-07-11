'use client';

import {useEffect, useState} from 'react';
import { Title, Text, Button, TextInput, Box, Center, Container, rem, Paper } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useRouter } from 'next/navigation';
import { Header } from '../components/Header/Header';
import { Footer } from '../components/Footer/Footer';
import classes from './LandingPage.module.css';
import {BASE_URL} from "../utils/DevMode";



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

  //
  useEffect(() => {
    // check if user is already logged in

    //router.push("/home")

  }, [])


  return (
    <>
      {/* <Header /> */}
      <Center className={classes.landingPageContent}>
        <Container size={400} className={classes.container}>
          <img src="/stacksLOGO.jpg" alt="Logo" className={classes.logo} />
          <img src="/stacks.png" alt="Logo" className={classes.logo} />
          {/* <Text ta="center" mt={10} size={rem(50)} fw="700" className={classes.title}>
            STACKY
          </Text> */}
          <Text c="dimmed" ta="center" size="md" className={classes.subtitle}>
            AI-Curated Democratic Discourse
          </Text>

          <Paper radius="md" p="xl" withBorder className={classes.paper}>
            <Text size="lg" fw={600} ta="center" mb="1rem">
              Login to Mastodon
            </Text>

            <form onSubmit={form.onSubmit(handleLogin)}>
              <TextInput
                required
                radius="lg"
                label="Mastodon Instance"
                placeholder="instance domain"
                {...form.getInputProps('instanceDomain')}
              />
              <Button type="submit" fullWidth loading={isLoading} mt="2rem" radius="lg" color="pink" variant="light">
                Login
              </Button>
            </form>
          </Paper>
        </Container>
      </Center>
      {/* <Footer /> */}
    </>
  );
}
