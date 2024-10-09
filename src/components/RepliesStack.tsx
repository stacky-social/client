import React, { useRef, useEffect, useState } from 'react';
import { Paper, UnstyledButton, Group, Avatar, Text, Divider, Button } from '@mantine/core';
import { IconMessageCircle, IconHeart, IconHeartFilled, IconBookmark, IconBookmarkFilled, IconShare, IconQuestionMark, IconBulb, IconQuote, IconLink, IconPointer, IconBook, IconMoodSmile, IconFrame, IconUser, IconStack } from '@tabler/icons-react';
import { formatDistanceToNow } from 'date-fns';
import RelatedStackCount from './RelatedStackCount';
import StackPostsModal from './StackPostsModal';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
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
  content_rewritten: string;
  rewrite: 
  {content: string; 
    significant:boolean;
 } 
}

interface RepliesStackType {
  stackId: string;
  rel: string;
  size: number;
  topPost: PostType;
}

interface RepliesStackProps {
  repliesStacks: RepliesStackType[];
  cardWidth: number;
  onStackClick: (stackId: string) => void;
  setIsExpandModalOpen: (isOpen: boolean) => void;
  showupdate: boolean;
}

const iconMapping: { [key: string]: JSX.Element } = {
  uncategorized: <IconStack size={24} />,
  predictions: <IconBulb size={24} />,
  evidence_public: <IconQuote size={24} />,
  evidence_personal: <IconUser size={24} />,
  connections: <IconLink size={24} />,
  pointers: <IconPointer size={24} />,
  proposals: <IconBook size={24} />,
  humor: <IconMoodSmile size={24} />,
  values: <IconHeart size={24} />,
  framing: <IconFrame size={24} />,
  questions: <IconQuestionMark size={24} />,
  default: <IconStack size={24} />,
};

const RepliesStack: React.FC<RepliesStackProps> = ({ repliesStacks, cardWidth, onStackClick, setIsExpandModalOpen, showupdate }) => {
  const [stackPostsModalOpen, setStackPostsModalOpen] = useState(false);
  const [currentStackId, setCurrentStackId] = useState('');
  const router = useRouter();
  const [maxStacksToShow, setMaxStacksToShow] = useState(4);
  const [cardHeights, setCardHeights] = useState<number[]>([]);
  const [cardWidths, setCardWidths] = useState<number[]>([]);
  const paperRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const heights = paperRefs.current.map(ref => ref?.offsetHeight || 0);
    const widths = paperRefs.current.map(ref => ref?.offsetWidth || 0);
    setCardWidths(widths);
    setCardHeights(heights);
    heights.forEach((height, index) => {
      console.log(`Paper ${index} height:`, height);
      console.log(`Stacked div ${index} height:`, height);
    });
  }, [repliesStacks]);

  const handleStackCountClick = (stackId: string) => {
   
    setCurrentStackId(stackId);
    console.log('Stack count clicked:', stackId);
    setStackPostsModalOpen(true);
    setIsExpandModalOpen(true);
  };

  const handleNavigate = (postId: string, newStackId: string) => {
    const url = `/posts/${postId}?stackId=${newStackId || ''}`;
    router.push(url);
  };

  const containerVariants = {
    hidden: { opacity: 1 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
      },
    },
  };

  const itemVariants = (index: number) => ({
    hidden: showupdate ? { opacity: 0, x: -200, y: -200 * (index + 1) } : { opacity: 0, y: 200 },
    show: { 
      opacity: 1, 
      x: 0, 
      y: 0,
      transition: {
        duration: 0.5 
      }
    },
  });

  let clickTimeout: NodeJS.Timeout;
  let preventClick = false;
  const handleSingleClick = (postId: string, stackId: string) => {
    clickTimeout = setTimeout(() => {
      if (!preventClick) {
        handleNavigate(postId, stackId);
      }
      preventClick = false;
    }, 300); 
  };

  const handleDoubleClick = (stackId: string) => {
    clearTimeout(clickTimeout);
    preventClick = true;
    handleStackCountClick(stackId);
  };

  return (
    <div
      
      style={{ display: 'flex', flexDirection: 'column', gap: '2rem', alignItems: 'center', width: '100%' }}
    >
      {repliesStacks.slice(0, maxStacksToShow).map((stack, index) => (
        <div
          key={stack.stackId}
     
          style={{
            position: 'relative',
            margin: '20px 20px',
            marginTop: '30px',
            width: '80%',
          }}
        >
          <Paper
            ref={(el) => {
              paperRefs.current[index] = el;
            }}
            style={{
              position: 'relative',
              width: '80%',
              backgroundColor: '#f6f3e1',
              zIndex: 5,
              boxShadow: '0 3px 10px rgba(0,0,0,0.1)',
              margin: '0 auto',
              paddingTop: '40px',

            }}
     
          >
            {/* {stack.topPost.rewrite.significant&&  (
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
            )} */}
            <UnstyledButton
              onClick={() => handleSingleClick(stack.topPost.id, stack.stackId)}
              onDoubleClick={() => handleDoubleClick(stack.stackId)}
              style={{ width: '100%' }}
            >
              <Group style={{ padding: '0 20px' }}>
                <Avatar src={stack.topPost.account.avatar} alt={stack.topPost.account.display_name} radius="xl" />
                <div>
                <Text size="md" fw={700} c="#011445" >{stack.topPost.account.display_name}</Text>
                  <Text size="xs" c="dimmed">
                    {formatDistanceToNow(new Date(stack.topPost.created_at))} ago
                  </Text>
                </div>
              </Group>

              <div
                style={{
                  paddingTop: '1rem',
                  paddingLeft: '1rem',
                  paddingRight: '1rem',

                }}
                
              >
                {stack.topPost.content_rewritten ? (
                  <Text c="#011445" dangerouslySetInnerHTML={{ __html: stack.topPost.rewrite.content }} />
                ) : (
                  <Text c="#011445" dangerouslySetInnerHTML={{ __html: stack.topPost.content }} />
                )}
              </div>

              {/* <Text pl={54} pt="sm" size="sm">
                Post Id: {stack.topPost.id}
              </Text>
              <Text pl={54} pt="sm" size="sm">
                Stack Id: {stack.stackId}
              </Text> */}
            </UnstyledButton>
{/* 
            <div className="rel-display">
              {iconMapping[stack.rel] || iconMapping['default']} {stack.rel}
            </div> */}
            <Divider my="md" c="#011445" />
            <Group style={{ display: 'flex', justifyContent: 'space-between', padding: '0 20px' }}>
              <Button variant="subtle" size="sm" radius="lg">
                <IconMessageCircle  style={{ color: '#002379' }}  size={20} /> <Text style={{ color: '#002379' }}  ml={4}>{stack.topPost.replies_count}</Text>
              </Button>
              <Button variant="subtle" size="sm" radius="lg">
                {stack.topPost.favourited ? <IconHeartFilled style={{ color: '#002379' }}  size={20} /> : <IconHeart style={{ color: '#002379' }}  size={20} />}{' '}
                <Text  style={{ color: '#002379' }}  ml={4}>{stack.topPost.favourites_count}</Text>
              </Button>
              <Button variant="subtle" size="sm" radius="lg">
                {stack.topPost.bookmarked ? <IconBookmarkFilled style={{ color: '#002379' }} size={20} /> : <IconBookmark style={{ color: '#002379' }}  size={20} />}
              </Button>
              <Button variant="subtle" size="sm" radius="lg">
                <IconShare  style={{ color: '#002379' }}  size={20} />
              </Button>
            </Group>
            {stack.size !== null && stack.size > 1 && (
              <RelatedStackCount count={stack.size} onClick={() => handleStackCountClick(stack.stackId)} />
            )}
          </Paper>

          {stack.size !== null && stack.size > 1 && 
            [...Array(3)].map((_, idx) => (
              <div
                key={idx}
                style={{
                  position: 'absolute',
                  bottom: `${-15 + 5 * idx}px`,
                  left: `${80 - 5 * idx}px`,
                  width: `${cardWidths[index] || 0}px`,
                  height: `${cardHeights[index] || 0}px`,
                  backgroundColor: '#5a71a8',
                  zIndex: idx + 1,
                  boxShadow: '0 3px 10px rgba(0,0,0,0.1)',
                  border: '1.5px solid white',
                }}
              />
            ))}
        </div>
      ))}

      <StackPostsModal
        isOpen={stackPostsModalOpen}
        onClose={() => {
          setStackPostsModalOpen(false);
          setIsExpandModalOpen(false);
        }}
        apiUrl={`https://beta.stacky.social:3002/stacks/${currentStackId}/posts`}
        stackId={currentStackId}
      />
    </div>
  );
};

export default RepliesStack;
