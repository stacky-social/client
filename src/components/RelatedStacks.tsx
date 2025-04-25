import React, { useRef, useEffect, useState } from 'react';
import { Paper, UnstyledButton, Group, Avatar, Text, Divider, Button } from '@mantine/core';
import { IconMessageCircle, IconHeart, IconHeartFilled, IconBookmark, IconBookmarkFilled, IconShare, IconQuestionMark, IconBulb, IconQuote, IconLink, IconPointer, IconBook, IconMoodSmile, IconFrame, IconUser, IconStack, IconThumbUp,IconThumbDown } from '@tabler/icons-react';
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
    {
      content: string; 
      significant:boolean;
   } ;
   content_highlight: string;

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
  uncategorized: <IconStack size={20} />,
  predictions: <IconBulb size={20} />,
  evidence_public: <IconQuote size={20} />,
  evidence_personal: <IconUser size={20} />,
  connections: <IconLink size={20} />,
  pointers: <IconPointer size={20} />,
  proposals: <IconBook size={20} />,
  humor: <IconMoodSmile size={20} />,
  values: <IconHeart size={20} />,
  framing: <IconFrame size={20} />,
  questions: <IconQuestionMark size={20} />,
  default: <IconStack size={20} />,
  agree: <IconThumbUp size={20} />,
  disagree: <IconThumbDown size={20} />,
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

  // const formatContent = (content:string) => {
  
  //   let formattedContent = content
  //     .replace(/⌊(.*?)⌋/g, '<span style="color: #5502b5;">$1</span>')
  //     .replace(/⌈(.*?)⌉/g, '<span style="color: #0235b5;">$1</span>')
  //     .replace(/…/g, '<span style="color:#b50202;">…</span>')
  
  //   return { __html: formattedContent };
  // };

  const formatContent = (content: string) => {
    let formattedContent = content
      .replace(/⌊(.*?)⌋/g, '<mark style="background-color: #e0f0ff; padding: 0 2px;">$1</mark>')
      .replace(/⌈(.*?)⌉/g, '<mark style="background-color: #e0f0ff; padding: 0 2px;">$1</mark>')
      .replace(/⟦(.*?)⟧/g, '<mark style="background-color: #d4f9d3; padding: 0 2px;">$1</mark>')
      .replace(/…/g, '<mark style="background-color: #e0f0ff; padding: 0 2px;">…</mark>');
  
    return { __html: formattedContent };
  };

  // 解析单个带标记的文本，提取纯文本+高亮区间
function parseHighlight(text: string, source: 'green' | 'blue') {
  let plainText = '';
  const highlights: { start: number; end: number; source: 'green' | 'blue' }[] = [];
  let i = 0;
  let highlightStart = -1;

  while (i < text.length) {
    if (text[i] === '⌊' || text[i] === '⌈' || text[i] === '⟦') {
      highlightStart = plainText.length;
      i++;
    } else if (text[i] === '⌋' || text[i] === '⌉' || text[i] === '⟧') {
      highlights.push({ start: highlightStart, end: plainText.length, source });
      highlightStart = -1;
      i++;
    } else {
      plainText += text[i];
      i++;
    }
  }

  return { plainText, highlights };
}

// 合并两个高亮列表，识别 overlap 区域
function mergeHighlights(text: string, highlights1: any[], highlights2: any[]) {
  const points: { pos: number; add: 'green' | 'blue'; remove: 'green' | 'blue' }[] = [];

  highlights1.forEach(({ start, end }) => {
    points.push({ pos: start, add: 'green', remove: null as any });
    points.push({ pos: end, add: null as any, remove: 'green' });
  });
  highlights2.forEach(({ start, end }) => {
    points.push({ pos: start, add: 'blue', remove: null as any });
    points.push({ pos: end, add: null as any, remove: 'blue' });
  });

  points.sort((a, b) => a.pos - b.pos || (a.add ? -1 : 1)); // 先加后减

  const result: { text: string; color: 'none' | 'green' | 'blue' | 'both' }[] = [];
  let currentColorSet = new Set<string>();
  let lastPos = 0;

  for (let p of points) {
    if (p.pos > lastPos) {
      let color: 'none' | 'green' | 'blue' | 'both' = 'none';
      if (currentColorSet.has('green') && currentColorSet.has('blue')) color = 'both';
      else if (currentColorSet.has('green')) color = 'green';
      else if (currentColorSet.has('blue')) color = 'blue';
      result.push({ text: text.slice(lastPos, p.pos), color });
    }
    if (p.add) currentColorSet.add(p.add);
    if (p.remove) currentColorSet.delete(p.remove);
    lastPos = p.pos;
  }

  if (lastPos < text.length) {
    let color: 'none' | 'green' | 'blue' | 'both' = 'none';
    if (currentColorSet.has('green') && currentColorSet.has('blue')) color = 'both';
    else if (currentColorSet.has('green')) color = 'green';
    else if (currentColorSet.has('blue')) color = 'blue';
    result.push({ text: text.slice(lastPos), color });
  }

  return result;
}

// 根据合并后的分段生成 HTML
function buildHighlightHtml(merged: { text: string; color: string }[]) {
  return merged.map(({ text, color }) => {
    if (color === 'green') return `<mark style="background-color: #d4f9d3; padding: 0 2px;">${text}</mark>`;
    if (color === 'blue') return `<mark style="background-color: #e0f0ff; padding: 0 2px;">${text}</mark>`;
    if (color === 'both') return `<mark style="background-color: #7FFFD4; padding: 0 2px;">${text}</mark>`;
    return text;
  }).join('');
}

// 总调用函数！传 content_highlight 和 rewrite.content，返回最终 HTML
function mergeHighlight(contentHighlight: string, rewriteContent: string) {
  const parsed1 = parseHighlight(contentHighlight, 'green');
  const parsed2 = parseHighlight(rewriteContent, 'blue');

  if (parsed1.plainText !== parsed2.plainText) {
    console.warn('Warning: highlight plain texts not matching!');
  }

  const merged = mergeHighlights(parsed1.plainText, parsed1.highlights, parsed2.highlights);
  const finalHtml = buildHighlightHtml(merged);
  return finalHtml;
}

  

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

  const handleMouseUp = (postId: string, stackId: string) => {
    const selection = window.getSelection();
    if (selection && selection.toString().length === 0) {
      handleNavigate(postId, stackId);
    }
  };

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      style={{ display: 'flex', flexDirection: 'column', gap: '0rem', alignItems: 'center', width: '100%' }}
    >
      {relatedStacks.slice(0, maxStacksToShow).map((stack, index) => {
        const isHovered = hoveredIndex === index;
        // const contentToDisplay =
        //   isHovered && stack.topPost.content_highlight
        //     ? stack.topPost.content_highlight
        //     : stack.topPost.rewrite.significant
        //     ? stack.topPost.rewrite.content
        //     : stack.topPost.content;
  
        const contentToDisplay = isHovered
  ? mergeHighlight(stack.topPost.content_highlight, stack.topPost.rewrite.content)
  : stack.topPost.rewrite.significant
    ? formatContent(stack.topPost.rewrite.content)
    : formatContent(stack.topPost.content);
        return (
          <motion.div
            key={stack.stackId}
            variants={itemVariants(index)}
            style={{
              position: 'relative',
              margin: '20px 20px',
              marginTop: '1rem',
              width: cardWidth,
              boxShadow: '0 10px 10px rgba(0,0,0,0.1)',
              borderRadius: '10px',
            }}
            onMouseEnter={() => {
              setHoveredIndex(index);
              // setTimeout(() => {
              //   const newHeights = [...cardHeights];
              //   newHeights[index] = paperRefs.current[index]?.scrollHeight || 0;
              //   setCardHeights(newHeights);
              // }, 50); // 延迟 50ms，让 DOM 真正渲染出来
            }}
            
            
            onMouseLeave={() => {
              setHoveredIndex(null);
              // // 恢复成原本 card 的高度（即加载完后默认设置的 cardHeights）
              // setTimeout(() => {
              //   const newHeights = [...cardHeights];
              //   newHeights[index] = cardHeights[index]; // 直接恢复原来的 cardHeight
              //   setCardHeights(newHeights);
              // }, 50); // 适当延时让 DOM 收回原始状态
            }}
            
          >
            <Paper
              ref={(el) => {
                paperRefs.current[index] = el;
              }}
              style={{
                position: 'relative',
                width: cardWidth,
                backgroundColor: '#ffffff',
                zIndex: 5,
                borderRadius: '10px',
                margin: '0 auto',
                paddingTop: '40px',
                border: '1px solid #e7e7e7',
              }}
            >
              {stack.topPost.rewrite.significant && (
                <div
                  style={{
                    position: 'absolute',
                    top: '10px',
                    left: '10px',
                    background: '#E0E6ff',
                    color: '2435A3',
                    borderRadius: '5px',
                    padding: '2px 6px',
                    fontWeight: 'bold',
                    zIndex: 10,
                    fontSize: '10px',
                  }}
                >
                  Modified by AI
                </div>
              )}
              <UnstyledButton
                onClick={() => handleSingleClick(stack.topPost.id, stack.stackId)}
                onDoubleClick={() => handleDoubleClick(stack.stackId)}
                style={{ width: '100%' }}
              >
                <Group style={{ paddingLeft: '1rem' }}>
                  <Avatar src={stack.topPost.account.avatar} alt={stack.topPost.account.display_name} radius="xl" />
                  <div>
                    <Text size="md" fw={700} c="#011445">
                      {stack.topPost.account.display_name}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {formatDistanceToNow(new Date(stack.topPost.created_at))} ago
                    </Text>
                  </div>
                </Group>
              </UnstyledButton>
  
              <div
                onMouseUp={() => handleMouseUp(stack.topPost.id, stack.stackId)}
                style={{ paddingLeft: '54px', paddingRight: '1rem' }}
              >
                <div
                  style={{
                    display: isHovered ? 'block' : '-webkit-box',
                    WebkitBoxOrient: 'vertical',
                    WebkitLineClamp: 5,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    marginTop: '0px',
                    lineHeight: '1.5',
                    color: '#011445',
                  }}
                  dangerouslySetInnerHTML={{ __html: contentToDisplay }}
                />
              </div>
  
              <div className="rel-display">
                {iconMapping[stack.rel] || iconMapping['default']} {stack.rel}
              </div>
              <Divider style={{ marginTop: '0.5rem' }} />
              <Group style={{ display: 'flex', justifyContent: 'space-between', padding: '0 10px' }}>
                <Button variant="subtle" size="sm" radius="lg">
                  <IconMessageCircle size={20} style={{ color: '#002379' }} />
                  <Text style={{ color: '#002379' }} ml={4}>
                    {stack.topPost.replies_count}
                  </Text>
                </Button>
                <Button variant="subtle" size="sm" radius="lg">
                  {stack.topPost.favourited ? (
                    <IconHeartFilled size={20} style={{ color: '#002379' }} />
                  ) : (
                    <IconHeart size={20} style={{ color: '#002379' }} />
                  )}
                  <Text ml={4} style={{ color: '#002379' }}>
                    {stack.topPost.favourites_count}
                  </Text>
                </Button>
                <Button variant="subtle" size="sm" radius="lg">
                  {stack.topPost.bookmarked ? (
                    <IconBookmarkFilled size={20} style={{ color: '#002379' }} />
                  ) : (
                    <IconBookmark size={20} style={{ color: '#002379' }} />
                  )}
                </Button>
                <Button variant="subtle" size="sm" radius="lg">
                  <IconShare size={20} style={{ color: '#002379' }} />
                </Button>
              </Group>
              {stack.size !== null && stack.size > 1 && (
                <RelatedStackCount count={stack.size} onClick={() => handleStackCountClick(stack.stackId)} />
              )}
            </Paper>
  
            {stack.size !== null &&
  stack.size > 1 &&
  [...Array(3)].map((_, idx) => (
    <div
      key={idx}
      style={{
        position: 'absolute',
        bottom: `${-15 + 5 * idx}px`,
        left: `${15 - 5 * idx}px`,
        width: cardWidth,
        height:
          hoveredIndex === index
            ? paperRefs.current[index]?.scrollHeight || cardHeights[index] || 0
            : cardHeights[index] || 0,
        backgroundColor: '#ffffff',
        zIndex: idx + 1,
        borderRadius: '10px',
        border: '1px solid #e7e7e7',
        transition: 'height 0.3s ease',
      }}
    />
  ))}

          </motion.div>
        );
      })}
  
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
