import React from 'react';
import { Paper, UnstyledButton, Group, Avatar, Text, Divider, Button } from '@mantine/core';
import { IconMessageCircle, IconHeart, IconHeartFilled, IconBookmark, IconBookmarkFilled, IconShare } from '@tabler/icons-react';
import { formatDistanceToNow } from 'date-fns';
import RelatedStackCount from './RelatedStackCount';  // 引入新组件
import StackPostsModal from './StackPostsModal';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import './RelatedStacks.css';

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
  relatedStacks: RelatedStackType[];
  cardWidth: number;
  cardHeight: number;
  onStackClick: (stackId: string) => void;
}

const RelatedStacks: React.FC<RelatedStacksProps> = ({ relatedStacks, cardWidth, cardHeight, onStackClick }) => {
  const [stackPostsModalOpen, setStackPostsModalOpen] = useState(false);
  const [currentStackId, setCurrentStackId] = useState('');
  const router = useRouter();
  const [maxStacksToShow, setMaxStacksToShow] = useState(3);

  const handleStackCountClick = (stackId: string) => {
    setCurrentStackId(stackId);
    setStackPostsModalOpen(true);
  };

  const handleNavigate = (postId: string, newStackId: string) => {
    const url = `/posts/${postId}?stackId=${newStackId || ''}`;
    router.push(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', alignItems: 'center', width: '100%' }}>
      <TransitionGroup>
      {relatedStacks.slice(0, maxStacksToShow).map((stack) => (
          <CSSTransition
            key={stack.stackId}
            timeout={500}
            classNames="slide"
          >
            <div
              key={stack.stackId}
              style={{
                position: 'relative',
                margin: '20px 20px',
                marginTop: '30px',
                width: cardWidth,
              }}
            >
              <Paper style={{
                  position: 'relative',
                  width: cardWidth,
                  backgroundColor: 'rgba(227, 250, 252, 0.8)',
                  zIndex: 5,
                  boxShadow: '0 3px 10px rgba(0,0,0,0.1)',
                  borderRadius: '8px',
                  margin: '0 auto',
              }} withBorder>
                <UnstyledButton onClick={() => handleNavigate(stack.topPost.id, stack.stackId)} style={{ width: '100%' }}>
                  <Group>
                    <Avatar src={stack.topPost.account.avatar} alt={stack.topPost.account.display_name} radius="xl" />
                    <div>
                      <Text size="sm">{stack.topPost.account.display_name}</Text>
                      <Text size="xs" color="dimmed">{formatDistanceToNow(new Date(stack.topPost.created_at))} ago</Text>
                    </div>
                  </Group>
                  <div style={{ paddingTop: '1rem', paddingLeft: '1rem', paddingRight: '1rem', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: '3', WebkitBoxOrient: 'vertical' }}>
                    <div dangerouslySetInnerHTML={{ __html: stack.topPost.content }} />
                  </div>
                  <Text pl={54} pt="sm" size="sm">Post Id: {stack.topPost.id}</Text>
                  <Text pl={54} pt="sm" size="sm">Stack Id: {stack.stackId}</Text>
                </UnstyledButton>
                <div className="rel-display">{stack.rel}</div>
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
                <RelatedStackCount count={stack.size} onClick={() => handleStackCountClick(stack.stackId)} />
              </Paper>

              {stack.size !== null && [...Array(4)].map((_, index) => (
                <div
                  key={index}
                  style={{
                    position: 'absolute',
                    bottom: `${20 - 5 * (index + 1)}px`,
                    left: `${20 - 5 * (index + 1)}px`,
                    width: "100%",
                    height: `${cardHeight+10}px`,
                    backgroundColor: 'rgba(227, 250, 252, 0.8)',
                    zIndex: index + 1,
                    boxShadow: '0 3px 10px rgba(0,0,0,0.1)',
                    borderRadius: '8px',
                    border: '1px solid rgba(0, 0, 0, 0.1)',
                  }}
                />
              ))}
            </div>
          </CSSTransition>
        ))}
      </TransitionGroup>
      
      <StackPostsModal
        isOpen={stackPostsModalOpen}
        onClose={() => setStackPostsModalOpen(false)}
        apiUrl={`https://beta.stacky.social:3002/stacks/${currentStackId}/posts`}
        stackId={currentStackId}
      />
    </div>
  );
};

export default RelatedStacks;
