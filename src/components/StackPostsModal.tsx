import React from 'react';
import { Modal, ScrollArea, Text, Title, Divider } from '@mantine/core';

interface StackPostsModalProps {
  isOpen: boolean;
  onClose: () => void;
  posts: {
    id: string;
    text: string;
    author: string;
    createdAt: string;
  }[];
}

function StackPostsModal({ isOpen, onClose, posts }: StackPostsModalProps) {
  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title="Stack Posts"
      size="lg"
      centered
    >
      <ScrollArea style={{ height: 400 }}>
        {posts.length > 0 ? (
          posts.map(post => (
            <div key={post.id} style={{ marginBottom: '1rem' }}>
              <Title order={4}>{post.author}</Title>
              <Text>{post.text}</Text>
              <Text size="sm" color="dimmed">{post.createdAt}</Text>
              <Divider my="sm" />
            </div>
          ))
        ) : (
          <Text>No posts found in this stack.</Text>
        )}
      </ScrollArea>
    </Modal>
  );
}

export default StackPostsModal;
