"use client";
import React, { useState, useEffect } from 'react';
import { TextInput, rem, Box, Paper, ActionIcon, useMantineTheme, List, ThemeIcon, Avatar, UnstyledButton, Group, Tabs } from '@mantine/core';
import { IconArrowRight, IconSearch, IconUser, IconTag, IconMessageCircle } from '@tabler/icons-react';
import axios from 'axios';
import { useRouter } from 'next/navigation';

type SearchResult = {
  accounts: Array<{
    id: string;
    username: string;
    acct: string;
    display_name: string;
    locked: boolean;
    created_at: string;
    note: string;
    url: string;
    avatar: string;
    header: string;
  }>;
  statuses: Array<{
    id: string;
    created_at: string;
    content: string;
  }>;
  hashtags: Array<{
    name: string;
    url: string;
    history: Array<{
      day: string;
      uses: string;
      accounts: string;
    }>;
  }>;
};

export default function SearchBar() {
  const router = useRouter();
  const theme = useMantineTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult>({ accounts: [], statuses: [], hashtags: [] });
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    setAccessToken(token);
    setMounted(true);
  }, []);

  const icon = <IconSearch style={{ width: rem(16), height: rem(16) }} />;

  const handleSearch = async () => {
    if (!accessToken) {
      console.error('No access token found');
      return;
    }

    try {
      const response = await axios.get(`https://beta.stacky.social/api/v2/search`, {
        params: { q: query, limit: 10 },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      console.log('Search results:', response.data);
      setResults(response.data);
    } catch (error) {
      console.error('Error searching Mastodon:', error);
    }
  };

  const handleNavigateToUser = (acct: string) => {
    const url = `/user/${acct}`;
    router.push(url);
  };

  const handleNavigateToTag = (tag: string) => {
    const url = `/tag/${tag}`;
    router.push(url);
  };

  const handleNavigateToStatus = (statusId: string) => {
    const url = `/posts/${statusId}`;
    router.push(url);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div>


<Paper withBorder p="md" mb="lg">
      <TextInput
        size="lg"
        radius="lg"
        placeholder="Search or Paste URL"
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        leftSection={icon}
        rightSection={
          <ActionIcon size={32} radius="xl" color={theme.primaryColor} variant="filled" onClick={handleSearch}>
            <IconArrowRight style={{ width: rem(18), height: rem(18) }} stroke={1.5} />
          </ActionIcon>
        }
      />
      
    </Paper>

    <Box mt="md">
        <Tabs defaultValue="accounts">
          <Tabs.List>
            <Tabs.Tab value="accounts" leftSection={<IconUser style={{ width: rem(16), height: rem(16) }} />}>
              Users
            </Tabs.Tab>
            <Tabs.Tab value="hashtags" leftSection={<IconTag style={{ width: rem(16), height: rem(16) }} />}>
              Hashtags
            </Tabs.Tab>
            <Tabs.Tab value="statuses" leftSection={<IconMessageCircle style={{ width: rem(16), height: rem(16) }} />}>
              Statuses
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="accounts">
            {results.accounts.length > 0 && (
              <List>
                {results.accounts.map((account) => (
                  <UnstyledButton key={account.id} onClick={() => handleNavigateToUser(account.acct)} style={{ width: '100%' }}>
                    <Paper withBorder p="md" mb="sm">
                      <Group>
                        <Avatar src={account.avatar} radius="xl" size="lg" />
                        <div>
                          <div>{account.display_name} (@{account.username})</div>
                          <div dangerouslySetInnerHTML={{ __html: account.note }} />
                        </div>
                      </Group>
                    </Paper>
                  </UnstyledButton>
                ))}
              </List>
            )}
          </Tabs.Panel>

          <Tabs.Panel value="hashtags">
            {results.hashtags.length > 0 && (
              <List>
                {results.hashtags.map((hashtag) => (
                  <UnstyledButton key={hashtag.name} onClick={() => handleNavigateToTag(hashtag.name)} style={{ width: '100%' }}>
                    <Paper withBorder p="md" mb="sm">
                      <Group>
                        <ThemeIcon color="green" size={32} radius="xl"><IconTag size={rem(18)} /></ThemeIcon>
                        <div>#{hashtag.name}</div>
                      </Group>
                    </Paper>
                  </UnstyledButton>
                ))}
              </List>
            )}
          </Tabs.Panel>

          <Tabs.Panel value="statuses">
            {results.statuses.length > 0 && (
              <List>
                {results.statuses.map((status) => (
                  <UnstyledButton key={status.id} onClick={() => handleNavigateToStatus(status.id)} style={{ width: '100%' }}>
                    <Paper withBorder p="md" mb="sm">
                      <ThemeIcon color="purple" size={32} radius="xl"><IconMessageCircle size={rem(18)} /></ThemeIcon>
                      <div dangerouslySetInnerHTML={{ __html: status.content }} />
                    </Paper>
                  </UnstyledButton>
                ))}
              </List>
            )}
          </Tabs.Panel>
        </Tabs>
      </Box>
    </div>
   
  );
}
