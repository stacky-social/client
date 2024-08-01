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
  const [activeTab, setActiveTab] = useState<string | null>('stacked');
  const [currentUrl, setCurrentUrl] = useState<string | null>(apiUrl);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    setAccessToken(token);
    console.log("api", apiUrl);
    setCurrentUrl(apiUrl);
  }, [apiUrl]); // 添加 apiUrl 作为依赖项

  useEffect(() => {
    if (stackId) {
      fetchSubstacks(stackId);
    }
  }, [stackId]);

  useEffect(() => {
    console.log("currentURL:", currentUrl);
  }, [currentUrl]);

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
    router.push(`/posts/${topPostId}`);
  };

  const handleStackIconClick = (relatedStacks: any[]) => {
    setRelatedStacks(relatedStacks);
  };

  const handleStackCountClick = (topPostId: string, substackID: string) => {
    console.log(topPostId);
    const newUrl = `https://beta.stacky.social:3002/stacks/${substackID}/posts`;
    setCurrentUrl(newUrl);
    fetchSubstacks(substackID);
  };

  useEffect(() => {
    console.log("Substacks:", substacks);
  }, [substacks]);



  const cards = substacks.map((stack) => (
    <div key={stack.substackId} style={{ margin: '2rem', width: '100%', position: 'relative'}}>
      <Paper
        style={{
          backgroundColor: '#f6f3e1',
          position: 'relative',
          marginRight: '2rem',
          borderRadius:'0px',
          zIndex:5,
          boxShadow: '0 3px 10px rgba(0,0,0,0.1)'
        }}
      >
        {stack.size !== null && stack.size > 1 && (
          <SubStackCount count={stack.size} onClick={() => handleStackCountClick(stack.topPost.id, stack.substackId)} />
        )}
        <UnstyledButton onClick={() => handleStackClick(stack.topPost.id)} style={{ width: '100%' }}>
          <Group style={{ marginTop: '1rem', marginLeft: '1rem' }}>
            <Avatar
              src={stack.topPost.account.avatar}
              alt={stack.topPost.account.display_name}
              radius="xl"
            />
            <div>
              <Text size="sm" style={{ color: '#011445' }}>{stack.topPost.account.display_name}</Text>
              <Text size="xs" c="dimmed">{formatDistanceToNow(new Date(stack.topPost.created_at))} ago</Text>
            </div>
          </Group>
          <div style={{ paddingLeft: '54px', paddingTop: '1rem', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: '3', WebkitBoxOrient: 'vertical' }}>
            <Text
              c="#011445"
              size="1rem"
              className="post-content"
              style={{ marginTop: '0px', lineHeight: '1.5', marginRight: '1rem' }}
              dangerouslySetInnerHTML={{ __html: stack.topPost.content }}
            />
          </div>
        </UnstyledButton>
        <Divider style={{marginTop:'1rem'}} />
        <Group style={{ display: 'flex', justifyContent: 'space-between', padding: '0 20px' }}>
          <Button variant="subtle" size="sm" radius="lg">
            <IconMessageCircle size={20} style={{ color: '#002379' }} /> <Text style={{ color: '#002379' }} ml={4}>{stack.topPost.replies_count}</Text>
          </Button>
          <Button variant="subtle" size="sm" radius="lg">
            {stack.topPost.favourited ? <IconHeartFilled size={20} style={{ color: '#002379' }} /> : <IconHeart size={20} style={{ color: '#002379' }} />} <Text style={{ color: '#002379' }} ml={4}>{stack.topPost.favourites_count}</Text>
          </Button>
          <Button variant="subtle" size="sm" radius="lg">
            {stack.topPost.bookmarked ? <IconBookmarkFilled size={20} style={{ color: '#002379' }} /> : <IconBookmark size={20} style={{ color: '#002379' }} />}
          </Button>
        </Group>
      </Paper>

      {stack.size != null && stack.size > 1&&[...Array(3)].map((_, index) => (
        <div
          key={index}
          style={{
            position: 'absolute',
            bottom: `${-15 + 5 * index}px`,
            left: `${10 - 5 * index}px`,
            width: '95%',
            height: '220px',
            backgroundColor: '#5a71a8',
            border: '0.5px solid #FCFBF5', 
          }}
        />
      ))}
    </div>
  ));


  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      size="80%"
      centered
      overlayProps={{
        backgroundOpacity: 0.55,
        color:'#fefefb',
        blur: 3
      }}
      style={{backgroundColor:'#fefefb'}}
      withCloseButton={false}
    >
    <div
    style={{backgroundColor: '#fefefb',padding:'2rem'}}
    >
    <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Tab value="list">List</Tabs.Tab>
          <Tabs.Tab value="stacked">Stacked</Tabs.Tab>
          <Tabs.Tab value="summary">Summary</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="list">
          <ScrollArea style={{ height: 600 }}>
            {currentUrl && (
              <PostList
                apiUrl={currentUrl}
                handleStackIconClick={handleStackIconClick}
                loadStackInfo={false}
                accessToken={accessToken}
                setIsModalOpen={() => { }}
                setIsExpandModalOpen={() => { }}
                activePostId={null}
                setActivePostId={() => { }}
              />
            )}
          </ScrollArea>
        </Tabs.Panel>
        <Tabs.Panel value="stacked">
          <Container py="xl" style={{ maxWidth: '1000px'}}>
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
    </div>
      
    </Modal>
  );
}

export default StackPostsModal;
