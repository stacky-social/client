"use client";
import React, { useState, useEffect, Suspense } from 'react';
import { TextInput, rem, Box, Paper, ActionIcon, useMantineTheme, List, ThemeIcon, Avatar, UnstyledButton, Group, Tabs } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowRight, IconSearch, IconUser, IconTag, IconMessageCircle } from '@tabler/icons-react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import Post from '../Posts/Post';
import RelatedStacks from '../RelatedStacks';
import { Loader } from '@mantine/core';
import { AnimatePresence, motion } from 'framer-motion';
import { useRelatedStacks } from '../../app/(shell)/related-stacks-context';

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
    account: {
      username: string;
      acct: string;
      avatar: string;
    };
    replies_count: number;
    favourites_count: number;
    favourited: boolean;
    bookmarked: boolean;
    media_attachments: any[];
    relatedStacks: any[];
    stackCount: number | null;
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

const MastodonInstanceUrl = 'https://beta.stacky.social';

export default function SearchBar() {
  const theme = useMantineTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult>({ accounts: [], statuses: [], hashtags: [] });
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [ResultPosts, setResultPosts] = useState<any[]>([]);
  const [relatedStacks, setRelatedStacks] = useState<any[]>([]);
  const [loadingRelatedStacks, setLoadingRelatedStacks] = useState(false);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [postPosition, setPostPosition] = useState<{ top: number, height: number } | null>(null);

  const router = useRouter();
  const { setFromPost } = useRelatedStacks();

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    setAccessToken(token);
  }, []);

  const fetchSearchResults = async (searchQuery: string, token: string | null) => {
    if (!token) {
      console.error('No access token found');
      return;
    }

    if (!searchQuery.trim()) return;
    try {
      const response = await axios.get(`${MastodonInstanceUrl}/api/v2/search`, {
        params: { q: searchQuery, limit: 10, resolve: true },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      console.log('Search results:', response.data);
      setResults(response.data);
      setResultPosts(response.data.statuses);
      response.data.statuses.forEach((status: any) => {
        fetchRelatedStacks(status);
      });
    } catch (error) {
      console.error('Error searching Mastodon:', error);
      notifications.show({ color: 'red', title: 'Search failed', message: 'Please try again later.' });
    }
  };

  const fetchRelatedStacks = async (post: any) => {
    setLoadingRelatedStacks(true);

    try {
      const headers: Record<string, string> = {};
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

      const response = await axios.get(`${MastodonInstanceUrl}:3002/stacks/${post.id}/related`, { headers });
      console.log('Related stacks:', response.data);
      const stackData = response.data.relatedStacks || [];
      const stackCount = response.data.size;

      setResultPosts((prevPosts) =>
        prevPosts.map((p) =>
          p.id === post.id ? { ...p, stackCount: stackCount, relatedStacks: stackData } : p
        )
      );

      setRelatedStacks((prevStacks) =>
        prevStacks.map((s) =>
          s.id === post.id ? { ...s, stackCount: stackCount, relatedStacks: stackData } : s
        )
      );

    } catch (error) {
      console.error('Error fetching related stacks:', error);
    } finally {
      setLoadingRelatedStacks(false);
    }
  };

  useEffect(() => {
    // console.log('ResultPosts:', ResultPosts);
  }, [ResultPosts]);

  const handleSearch = () => {
    fetchSearchResults(query, accessToken);
  };

  const handleNavigateToUser = (acct: string) => {
  const url = `/user/${acct}`;
  router.push(url); 
};

const handleNavigateToTag = (tag: string) => {
  const url = `/tag/${tag}`;
  router.push(url); 
};

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const renderStatus = (status: any) => {
    return (
      <Post
        key={status.id}
        id={status.id}
        text={status.content}
        author={status.account.username}
        account={status.account.acct}
        avatar={status.account.avatar}
        repliesCount={status.replies_count}
        createdAt={status.created_at}
        stackCount={status.stackCount || null}
        favouritesCount={status.favourites_count}
        favourited={status.favourited}
        bookmarked={status.bookmarked}
        mediaAttachments={status.media_attachments}
        onStackIconClick={handleStackIconClick}
        setIsModalOpen={() => {}}
        setIsExpandModalOpen={() => {}}
        relatedStacks={status.relatedStacks || []}
        setActivePostId={setActivePostId}
        activePostId={activePostId}
      />
    );
  };

  const handleStackIconClick = (
    relatedStacks: any[],
    postId: string,
    position: { top: number, height: number }
  ) => {
    if (Array.isArray(relatedStacks)) {
      setFromPost(relatedStacks, postId);
      setActivePostId(postId);
    }
  };

  return (
    <Suspense fallback={<Loader />}>
      <div>
        <div style={{ gridColumn: '1 / 2', position: 'relative' }}>
          <Paper withBorder p="md" mb="lg" style={{ borderRadius: '10px' }}>
            <TextInput
              placeholder="Search or Paste URL"
              variant="unstyled"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              onKeyDown={handleKeyDown}
              leftSection={<IconSearch style={{ width: rem(16), height: rem(16) }} />}
              rightSection={
                <ActionIcon size={32} radius="xl" color={theme.primaryColor} variant="filled" onClick={handleSearch}>
                  <IconArrowRight size={18} stroke={1.5} />
                </ActionIcon>
              }
            />
          </Paper>

          <Box mt="md">
            <Tabs defaultValue="posts">
              <Tabs.List>
                <Tabs.Tab value="posts" leftSection={<IconMessageCircle size={18} />}>
                  Posts
                </Tabs.Tab>
                <Tabs.Tab value="accounts" leftSection={<IconUser size={18} />}>
                  Users
                </Tabs.Tab>
                <Tabs.Tab value="hashtags" leftSection={<IconTag size={18} />}>
                  Hashtags
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
                            <ThemeIcon color="green" size={32} radius="xl"><IconTag size={18} /></ThemeIcon>
                            <div>#{hashtag.name}</div>
                          </Group>
                        </Paper>
                      </UnstyledButton>
                    ))}
                  </List>
                )}
              </Tabs.Panel>

              <Tabs.Panel value="posts">
                {ResultPosts.length > 0 && (
                  <List>
                    {ResultPosts.map((status) => (
                      <div key={status.id}>
                        {renderStatus(status)}
                      </div>
                    ))}
                  </List>
                )}
              </Tabs.Panel>
            </Tabs>
          </Box>
        </div>

        {/* Related stacks are now rendered in AppShell.Aside via context */}
      </div>
    </Suspense>
  );
}
