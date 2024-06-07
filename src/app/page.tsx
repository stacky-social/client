'use client';

import { useState } from 'react';
import { Title, Text, Button, TextInput, Box, Center } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useRouter } from 'next/navigation';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import classes from './LandingPage.module.css';

interface FormValues {
  username: string;
}

export default function LandingPage() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const form = useForm<FormValues>({
    initialValues: {
      username: '',
    },
    validate: {
      username: (value) => (/^[a-zA-Z0-9_]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value) ? null : '请输入有效的 Mastodon 用户名'),
    },
  });

  const handleSubmit = async (values: FormValues) => {
    setIsLoading(true);
    try {
      console.log('Submitting login form with values:', values);
      const instanceUrl = `https://${values.username.split('@')[1]}`;
      const accessToken = 'Vjshx_BvOsVDvJJDoWwCurinwPc-XoHMbYzcfT9hi20'; // access token for the Mastodon API

      const response = await fetch(`${instanceUrl}/api/v1/accounts/verify_credentials`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const data = await response.json();
      if (response.ok) {
        console.log('User data received:', data);
        notifications.show({
          title: 'Success',
          message: 'Login successful.',
          color: 'green',
        });
        router.push('/home'); // redirect to the home page
      } else {
        console.error('Error response from verify endpoint:', data);
        throw new Error(data.error || 'Unknown error');
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Login failed.',
        color: 'red',
      });
      console.error('Error during login:', error);
    } finally {
      setIsLoading(false);
    }
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
          <form onSubmit={form.onSubmit(handleSubmit)}>
            <TextInput
              required
              label="Mastodon username"
              placeholder="yourname@mastodon.instance"
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
