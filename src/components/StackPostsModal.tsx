"use client";

import React, { useEffect, useState } from 'react';
import { Modal, ScrollArea, Switch, SimpleGrid, Text, Container, Group, Avatar, Button, Divider, Paper, UnstyledButton, TextInput, rem } from '@mantine/core';
import axios from 'axios';
import { IconBookmark, IconHeart, IconMessageCircle, IconPhoto, IconSettings, IconShare, IconHeartFilled, IconBookmarkFilled, IconSearch } from "@tabler/icons-react";
import { formatDistanceToNow } from 'date-fns';
import { Code } from '@mantine/core';
import { useRouter } from 'next/navigation';
import classes from './expandModal.module.css';
import PostList from './PostList';
import SubStackCount from './SubStackCount';
import { Tabs } from '@mantine/core';

interface StackPostsModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiUrl: string;
  stackId: string | null;
}

interface PostType {
  id: string;
  created_at: string;
  replies_count: number;
  favourites_count: number;
  favourited: boolean;
  bookmarked: boolean;
  content: string;
  account: {
    avatar: string;
    display_name: string;
  };
}

interface Substack {
  substackId: string;
  size: number;
  topPost: PostType;
}

function StackPostsModal({ isOpen, onClose, apiUrl, stackId }: StackPostsModalProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [relatedStacks, setRelatedStacks] = useState<any[]>([]);
  const [substacks, setSubstacks] = useState<Substack[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const router = useRouter();
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>('list');

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    setAccessToken(token);
  }, []);

  useEffect(() => {
    if (stackId) {
      fetchSubstacks(stackId);
    }
  }, [stackId]);

  useEffect(() => {
    // Logic to reload PostList when apiUrl changes
    if (apiUrl) {
      fetchSubstacks(stackId);
    }
  }, [apiUrl]);

  const fetchSubstacks = async (id: string | null) => {
    if (!id) return;
    try {
      console.log("Fetching substacks for stack:", id);
      const response = await axios.get(`https://beta.stacky.social:3002/stacks/${id}/substacks`);
      const substacksData = response.data.map((item: any) => ({
        substackId: item.substackId,
        size: item.size,
        topPost: {
          id: item.topPost.id,
          created_at: item.topPost.created_at,
          replies_count: item.topPost.replies_count,
          favourites_count: item.topPost.favourites_count,
          favourited: item.topPost.favourited,
          bookmarked: item.topPost.bookmarked,
          content: item.topPost.content,
          account: {
            avatar: item.topPost.account.avatar,
            display_name: item.topPost.account.display_name,
          },
        },
      }));
      setSubstacks(substacksData);
    } catch (error) {
      console.error("Failed to fetch substacks:", error);
    }
  };

  const handleSearch = async (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      const filteredSubstacks = substacks.filter(substack =>
        substack.topPost.content.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setSubstacks(filteredSubstacks);
    }
  };

  const handleStackClick = (topPostId: string) => {
    console.log(`Navigating to /posts/${topPostId}`);
    // router.push(`/posts/${topPostId}`);
  };

  const handleStackIconClick = (relatedStacks: any[]) => {
    setRelatedStacks(relatedStacks);
  };

  const handleStackCountClick = (topPostId: string, substackID: string) => {
    console.log(topPostId);
    apiUrl = `https://beta.stacky.social:3002/stacks/${topPostId}/substacks`;
    stackId = substackID;
    console.log(substackID);
    fetchSubstacks(substackID);
  };

  useEffect(() => {
    console.log("Substacks:", substacks);
  }, [substacks]);

  const title = "";

  const cards = substacks.map((stack) => (
    <div key={stack.substackId} style={{ margin: '20px', width: '100%', position: 'relative' }}>
      {
        stack.size !== null && stack.size > 1 && (
          <SubStackCount count={stack.size} onClick={() => handleStackCountClick(stack.topPost.id, stack.substackId)} />
        )
      }
      <Paper
        style={{
          backgroundColor: '#fff',
          boxShadow: '0 3px 10px rgba(0,0,0,0.1)',
          borderRadius: '8px',
          position: 'relative',
        }}
        withBorder
      >
        <UnstyledButton onClick={() => handleStackClick(stack.topPost.id)} style={{ width: '100%' }}>
          <Group>
            <Avatar
              src={stack.topPost.account.avatar}
              alt={stack.topPost.account.display_name}
              radius="xl"
            />
            <div>
              <Text size="sm">{stack.topPost.account.display_name}</Text>
              <Text size="xs" color="dimmed">{formatDistanceToNow(new Date(stack.topPost.created_at))} ago</Text>
            </div>
          </Group>
          <div style={{ paddingLeft: '54px', paddingTop: '1rem', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: '3', WebkitBoxOrient: 'vertical' }}>
            <div dangerouslySetInnerHTML={{ __html: stack.topPost.content }} />
          </div>
          <Text pl={54} pt="sm" size="sm">Post Id: {stack.topPost.id}</Text>
          <Text pl={54} pt="sm" size="sm">Stack Id: {stack.substackId}</Text>
          <Text pl={54} pt="sm" size="sm">Stack size: {stack.size}</Text>
        </UnstyledButton>
        <Divider my="md" />
        <Group style={{ display: 'flex', justifyContent: 'space-between', padding: '0 20px' }}>
          <Button variant="subtle" size="sm" radius="lg">
            <IconMessageCircle size={20} /> <Text ml={4}>{stack.topPost.replies_count}</Text>
          </Button>
          <Button variant="subtle" size="sm" radius="lg">
            {stack.topPost.favourited ? <IconHeartFilled size={20} /> : <IconHeart size={20} />} <Text ml={4}>{stack.topPost.favourites_count}</Text>
          </Button>
          <Button variant="subtle" size="sm" radius="lg">
            {stack.topPost.bookmarked ? <IconBookmarkFilled size={20} /> : <IconBookmark size={20} />}
          </Button>
        </Group>
      </Paper>
    </div>
  ));

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      size="70%"
      centered
    >
      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Tab value="list">List</Tabs.Tab>
          <Tabs.Tab value="stacked">Stacked</Tabs.Tab>
          <Tabs.Tab value="summary">Summary</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="list">
          <ScrollArea style={{ height: 600 }}>
            <PostList
              apiUrl={apiUrl}
              handleStackIconClick={handleStackIconClick}
              loadStackInfo={false}
              accessToken={accessToken}
              setIsModalOpen={() => {}}
              setIsExpandModalOpen={() => {}}
              activePostId={null}
              setActivePostId={() => {}}
            />
          </ScrollArea>
        </Tabs.Panel>
        <Tabs.Panel value="stacked">
          <Container py="xl" style={{ maxWidth: '1000px', margin: '0 auto' }}>
            {/* <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
              <TextInput
                placeholder="Search"
                size="md"
                leftSection={<IconSearch style={{ width: rem(16), height: rem(16) }} stroke={1.5} />}
                rightSectionWidth={70}
                rightSection={<Code className={classes.searchCode}>Enter</Code>}
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.currentTarget.value)}
                onKeyDown={handleSearch}
                styles={{ input: { fontSize: '16px', width: '100%' }, root: { width: '100%', maxWidth: '800px' } }}
              />
            </div> */}
            <SimpleGrid cols={2} spacing="lg">{cards}</SimpleGrid>
          </Container>
        </Tabs.Panel>
        <Tabs.Panel value="summary">
          <ScrollArea style={{ height: 600 }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
            </div>
          </ScrollArea>
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}

export default StackPostsModal;
