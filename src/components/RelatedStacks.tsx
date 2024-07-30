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

const RelatedStacks: React.FC<RelatedStacksProps> = ({ relatedStacks, cardWidth, onStackClick, setIsExpandModalOpen, showupdate }) => {
  const [stackPostsModalOpen, setStackPostsModalOpen] = useState(false);
  const [currentStackId, setCurrentStackId] = useState('');
  const router = useRouter();
  const [maxStacksToShow, setMaxStacksToShow] = useState(3);
  const [cardHeights, setCardHeights] = useState<number[]>([]);
  const paperRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const heights = paperRefs.current.map(ref => ref?.offsetHeight || 0);
    setCardHeights(heights);
    heights.forEach((height, index) => {
      console.log(`Paper ${index} height:`, height);
      console.log(`Stacked div ${index} height:`, height);
    });
  }, [relatedStacks]);

  const handleStackCountClick = (stackId: string) => {
    setCurrentStackId(stackId);
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
  }, 300); // 延迟以区分单击和双击
};

const handleDoubleClick = (stackId: string) => {
  clearTimeout(clickTimeout); // 清除单击事件的计时器
  preventClick = true;
  handleStackCountClick(stackId);
};



  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      style={{ display: 'flex', flexDirection: 'column', gap: '2rem', alignItems: 'center', width: '100%' }}
    >
      {relatedStacks.slice(0, maxStacksToShow).map((stack, index) => (
        <motion.div
          key={stack.stackId}
          variants={itemVariants(index)}
          style={{
            position: 'relative',
            margin: '20px 20px',
            marginTop: '30px',
            width: cardWidth,
          }}
        >
          <Paper
            ref={(el) => {
              paperRefs.current[index] = el;
            }}
            style={{
              position: 'relative',
              width: cardWidth,
              backgroundColor: '#FFFAE6',
              zIndex: 5,
              // boxShadow: '0 3px 10px rgba(0,0,0,0.1)',
              borderRadius: '0px',
              margin: '0 auto',
              paddingTop: '40px',
              // border: '1.5px solid  white',
            }}
          
          >
            {stack.topPost && stack.topPost.content_rewritten && (
              <div
                style={{
                  position: 'absolute',
                  top: '10px',
                  left: '10px',
                  background: '#FF5F00',
                  color: 'white',
                  padding: '2px 6px',
         
                  fontWeight: 'bold',
                  zIndex: 10,
                }}
              >
                Rewritten by AI
              </div>
            )}
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
               style={{ paddingLeft: '54px', paddingTop: '1rem',paddingRight:'1rem' }}
              >

<div onClick={e => e.stopPropagation()} >
  {
     stack.topPost.content_rewritten ? (
      <Text
      c="#011445" 
      size="sm"
      dangerouslySetInnerHTML={{ __html: stack.topPost.content_rewritten }} />
    ) : (
      <Text
      c="#011445" 
      size="sm" dangerouslySetInnerHTML={{ __html: stack.topPost.content }} />
    )

  }
        
        </div>
               
              </div>

              {/* <Text pl={54} pt="sm" size="sm">
                Post Id: {stack.topPost.id}
              </Text>
              <Text pl={54} pt="sm" size="sm">
                Stack Id: {stack.stackId} */}
              {/* </Text> */}
            </UnstyledButton>

            <div className="rel-display">
              {iconMapping[stack.rel] || iconMapping['default']} {stack.rel}
            </div>
            <Divider my="md" />
            <Group style={{ display: 'flex', justifyContent: 'space-between', padding: '0 10px' }}>
              <Button variant="subtle" size="sm" radius="lg">
                <IconMessageCircle size={20} style={{ color: '#002379' }} /> <Text style={{ color: '#002379' }} ml={4}>{stack.topPost.replies_count}</Text>
              </Button>
              <Button variant="subtle" size="sm" radius="lg">
                {stack.topPost.favourited ? <IconHeartFilled size={20} style={{ color: '#002379' }} /> : <IconHeart size={20} style={{ color: '#002379' }}/>}{' '}
                <Text ml={4} style={{ color: '#002379' }}>{stack.topPost.favourites_count}</Text>
              </Button>
              <Button variant="subtle" size="sm" radius="lg">
                {stack.topPost.bookmarked ? <IconBookmarkFilled size={20} style={{ color: '#002379' }} /> : <IconBookmark size={20} style={{ color: '#002379' }}/>}
              </Button>
              <Button variant="subtle" size="sm" radius="lg">
                <IconShare size={20} style={{ color: '#002379' }} />
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
                  left: `${15 - 5 * idx}px`,
                  width: cardWidth,
                  height: `${cardHeights[index] || 0}px`,
                  backgroundColor: '#002379',
                  zIndex: idx + 1,
                  // boxShadow: '0 3px 10px rgba(0,0,0,0.1)',
                  borderRadius: '0px',
                  border: '1.5px solid white',
                  
                }}
              />
            ))}
        </motion.div>
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
    </motion.div>
  );
};

export default RelatedStacks;
