import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Paper, UnstyledButton, Group, Avatar, Text, Divider, Button } from '@mantine/core';
import { IconMessageCircle, IconHeart, IconHeartFilled, IconBookmark, IconBookmarkFilled, IconShare } from '@tabler/icons-react';
import { formatDistanceToNow } from 'date-fns';
import StackCount from './StackCount';

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

interface RelatedStackType {
  stackId: string;
  rel: string;
  size: number;
  topPost: PostType;
}

interface RelatedStacksProps {
  stackId: string;
  cardWidth: number;
  cardHeight: number;
  onStackClick: (stackId: string) => void;
}

const RelatedStacks: React.FC<RelatedStacksProps> = ({ stackId, cardWidth, cardHeight,onStackClick  }) => {
  const [relatedStacks, setRelatedStacks] = useState<RelatedStackType[]>([]);

  const getRelatedStacksByStackId = async (stackId: string) => {
    try {
      const response = await axios.get(`https://beta.stacky.social:3002/stacks/${stackId}/related`);
      return response.data.relatedStacks;
    } catch (error) {
      console.error('Error fetching related stacks by stackId:', error);
      return [];
    }
  };




  // const getRelatedStacksByStackId = async (stackId: string) => {
  //   try {
  //     //test
  //     return mockRelatedStacks.relatedStacks;
  //   } catch (error) {
  //     console.error('Error fetching related stacks by stackId:', error);
  //     return [];
  //   }
  // };


  useEffect(() => {
    const fetchRelatedStacks = async () => {
      const relatedStacks = await getRelatedStacksByStackId(stackId);
      setRelatedStacks(relatedStacks);
    };

    fetchRelatedStacks();
  }, [stackId]);

  const handleStackCountClick = async () => {
    // if (!stackId) return;

    // try {
    //     const response = await axios.get(`/api/stacks/${stackId}/posts`);
    //     const posts = response.data.posts.map((post: any) => ({
    //         id: post.id,
    //         text: post.text,
    //         author: post.author,
    //         createdAt: post.createdAt,
    //     }));
    //     setStackPosts(posts);
    //     setStackPostsModalOpen(true);
    // } catch (error) {
    //     console.error('Error fetching stack posts:', error);
    // }
    // setStackPosts(fakeStackPosts.posts);
    // setStackPostsModalOpen(true);
};

return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', margin: '2rem' }}>
        {relatedStacks.map((stack) => (
            <div key={stack.stackId} style={{ position: 'relative', margin: '20px', marginBottom: '2rem', width: cardWidth, marginLeft: '2rem' }}>
                <Paper
                    style={{
                        position: 'relative',
                        width: cardWidth,
                        backgroundColor: '#fff',
                        zIndex: 5,
                        boxShadow: '0 3px 10px rgba(0,0,0,0.1)',
                        borderRadius: '8px',
                    }}
                    withBorder
                >
                    <UnstyledButton onClick={() => onStackClick(stack.stackId)} style={{ width: '100%' }}> {/* 修改点击事件 */}
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
                        <Text pl={54} pt="sm" size="sm">Stack Id: {stack.stackId}</Text>
                        <Text pl={54} pt="sm" size="sm">Stack rel: {stack.rel}</Text>
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
                        <Button variant="subtle" size="sm" radius="lg">
                            <IconShare size={20} />
                        </Button>
                    </Group>
                    <StackCount count={stack.size !== null ? stack.size : 0} onClick={handleStackCountClick} />
                </Paper>
                {[...Array(4)].map((_, index) => (
            <div
              key={index}
              style={{
                position: 'absolute',
                bottom: `${20 - 5 * (index + 1)}px`,
                left: `${20 - 5 * (index + 1)}px`,
                width: cardWidth,
                height: `${cardHeight-10}px`,
                backgroundColor: '#fff',
                zIndex: index + 1,
                boxShadow: '0 3px 10px rgba(0,0,0,0.1)',
                borderRadius: '8px',
                border: '1px solid rgba(0, 0, 0, 0.1)',
              }}
            />
          ))}
            </div>
        ))}
    </div>
);
};

export default RelatedStacks;
