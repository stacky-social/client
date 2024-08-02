import React, { useEffect,useRef, useState } from 'react';
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
  rewrite: 
    {
      content: string; 
      significant:boolean;
   } 
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
  const [summary, setSummary] = useState<string | null>(null);
  const textRef = useRef<HTMLDivElement>(null);

  const fetchSummary = async (id: string) => {
    try {
      const response = await axios.get(`https://beta.stacky.social:3002/stacks/${id}/summary`);
      setSummary(response.data.summary);
    } catch (error) {
      console.error("fetching error:", error);
    }
  };

  const formatContent = (content: string) => {
    let formattedContent = content
      .replace(/⌊(.*?)⌋/g, '<span style="color: #5502b5;">$1</span>')
      .replace(/⌈(.*?)⌉/g, '<span style="color: #0235b5;">$1</span>')
      .replace(/…/g, '<span style="color:#b50202;">…</span>');

   
    const maxLength = 150; 
    if (formattedContent.length > maxLength) {
      formattedContent = formattedContent.substring(0, maxLength) + '... <span style="color: #5a71a8;">[Read More]</span>';
    }

    return { __html: formattedContent };
  };


  useEffect(() => {
    if (activeTab === 'summary' && stackId) {
      fetchSummary(stackId);
    }
  }, [activeTab, stackId]);


  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    setAccessToken(token);
    console.log("api", apiUrl);
    setCurrentUrl(apiUrl);
  }, [apiUrl]); 

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

      console.log("Substacks response:", response.data);
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
          rewrite:{
            content: item.topPost.rewrite.content,
            significant: item.topPost.rewrite.significant
          }
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
    const newUrl = `https://beta.stacky.social:3002/stacks/${substackID}/substacks`;
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

{
            stack.topPost.rewrite.significant&&  (
              <div
              style={{
                position: 'absolute',
                top: '10px',
                left: '10px',
                background: '#A6290D',
                color: 'white',
                padding: '2px 6px',
                fontWeight: 'bold',
                zIndex: 10,
                fontSize: '10px'
              }}
            >
              Modified by AI
            </div>
            )
}

        {stack.size !== null && stack.size > 1 && (
          <SubStackCount count={stack.size} onClick={() => handleStackCountClick(stack.topPost.id, stack.substackId)} />
        )}
        <UnstyledButton onClick={() => handleStackClick(stack.topPost.id)} style={{ width: '100%' }}>
          <Group style={{ marginTop: '2rem', marginLeft: '1rem' }}>
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

          <div ref={textRef} 
          style={{ 
            paddingLeft: '54px', 
            paddingTop: '1rem', 
           
            WebkitBoxOrient: 'vertical' }}>
            <Text
              c="#011445"
              size="1rem"
              className="post-content"
              style={{ marginTop: '0px', lineHeight: '1.5', marginRight: '1rem' }}
              dangerouslySetInnerHTML={formatContent(stack.topPost.content)}
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
            height: '90%',
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
      size="70%"
      centered
      overlayProps={{
        backgroundOpacity: 0.55,
        color:'#fefefb',
        blur: 3,
      }}
      styles={{body: { backgroundColor: '#fefefb'}, content:{maxWidth:'1200px'}}}
      withCloseButton={false}
    >
    <div
    style={{backgroundColor: '#fefefb',padding:'2rem'}}
    >
    <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Tab value="list">Recommended</Tabs.Tab>
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
            <div style={{ display: 'flex', justifyContent: 'center', padding:'3rem'}}>
              {summary ? (
                <Text size='1.1rem'>{summary}</Text>
              ) : (
                <Text size='1.3rem'>Loading....</Text>
              )}
            </div>
          </ScrollArea>
        </Tabs.Panel>
      </Tabs>
    </div>
      
    </Modal>
  );
}

export default StackPostsModal;
