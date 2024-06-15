import React from 'react';
import { Modal, ScrollArea, Text, Title, Divider, Paper, Group, Avatar, Button } from '@mantine/core';
import { IconHeart, IconBookmark, IconMessageCircle, IconShare, IconHeartFilled,IconBookmarkFilled} from '@tabler/icons-react';

export interface PostType {
  postId: string;
  text: string;
  author: string;
  avatar: string;
  replies: any[];
  createdAt: string;
  favouritesCount: number;
  favourited: boolean;
  bookmarked: boolean;
}

interface StackPostsModalProps {
  isOpen: boolean;
  onClose: () => void;
  posts: PostType[];
}

function StackPostsModal({ isOpen, onClose, posts }: StackPostsModalProps) {
  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title="Post in Stack"
      size="lg"
      centered
    >
      <ScrollArea style={{ height: 400 }}>
        {posts.length > 0 ? (
          posts.map((post) => (
            <Paper key={post.postId} withBorder radius="md" mt={20} p="lg" shadow="md">
              <Group>
                <Avatar src={post.avatar} alt={post.author} radius="xl" />
                <div>
                  <Text size="sm">{post.author}</Text>
                  <Text size="xs">{new Date(post.createdAt).toLocaleString()}</Text>
                </div>
              </Group>
              <Text pt="sm" size="sm" dangerouslySetInnerHTML={{ __html: post.text }} />
              <Divider my="md" />
              <Group justify="space-between">
                <Button variant="subtle" size="sm" radius="lg">
                  <IconMessageCircle size={20} /> <Text ml={4}>{post.replies.length}</Text>
                </Button>
                <Button variant="subtle" size="sm" radius="lg">
                  {post.favourited ? <IconHeartFilled size={20} /> : <IconHeart size={20} />} <Text ml={4}>{post.favouritesCount}</Text>
                </Button>
                <Button variant="subtle" size="sm" radius="lg">
                  {post.bookmarked ? <IconBookmarkFilled size={20} /> : <IconBookmark size={20} />}
                </Button>
                <Button variant="subtle" size="sm" radius="lg">
                  <IconShare size={20} /> <Text ml={4}>Share</Text>
                </Button>
              </Group>
            </Paper>
          ))
        ) : (
          <Text>No posts found in this stack.</Text>
        )}
      </ScrollArea>
    </Modal>
  );
}

export default StackPostsModal;
