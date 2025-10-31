import React, { useRef, useEffect, useState } from 'react';
import { Paper, UnstyledButton, Group, Avatar, Text, Divider } from '@mantine/core';
import { IconMessageCircle, IconHeart, IconHeartFilled, IconBookmark, IconBookmarkFilled, IconShare, IconQuestionMark, IconBulb, IconQuote, IconLink, IconPointer, IconBook, IconMoodSmile, IconFrame, IconUser, IconThumbUp,IconThumbDown } from '@tabler/icons-react';
import { Layers } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import RelatedStackCount from './RelatedStackCount';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import StackPostsModal from './StackPostsModal';
import InteractionControl from './InteractionControl';
import { toggleFavourite, toggleBookmark } from '../utils/mastoActions';
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
  cardWidth?: number | string;
  onStackClick: (stackId: string) => void;
  showupdate: boolean;
  onOpenModalWithStackId?: (stackId: string) => void;
}

const iconMapping: { [key: string]: JSX.Element } = {
  uncategorized: <Layers size={16} />,
  predictions: <IconBulb size={16} />,
  evidence_public: <IconQuote size={16} />,
  evidence_personal: <IconUser size={16} />,
  connections: <IconLink size={16} />,
  pointers: <IconPointer size={16} />,
  proposals: <IconBook size={16} />,
  humor: <IconMoodSmile size={16} />,
  values: <IconHeart size={16} />,
  framing: <IconFrame size={16} />,
  questions: <IconQuestionMark size={16} />,
  default: <Layers size={16} />,
  agree: <IconThumbUp size={16} />,
  disagree: <IconThumbDown size={16} />,
};

const RelatedStacks: React.FC<RelatedStacksProps> = ({ relatedStacks, cardWidth = "100%", onStackClick, showupdate, onOpenModalWithStackId }) => {
  const router = useRouter();
  const [maxStacksToShow, setMaxStacksToShow] = useState(3);
  const paperRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [stackPostsModalOpen, setStackPostsModalOpen] = useState(false);
  const [favouritedOverride, setFavouritedOverride] = useState<Record<string, boolean>>({});
  const [bookmarkedOverride, setBookmarkedOverride] = useState<Record<string, boolean>>({});
  const [favouritesCountOverride, setFavouritesCountOverride] = useState<Record<string, number>>({});

  const isFavourited = (postId: string, initial: boolean) =>
    favouritedOverride[postId] !== undefined ? favouritedOverride[postId] : initial;
  const isBookmarked = (postId: string, initial: boolean) =>
    bookmarkedOverride[postId] !== undefined ? bookmarkedOverride[postId] : initial;
  const getFavouritesCount = (postId: string, initial: number) =>
    favouritesCountOverride[postId] !== undefined ? favouritesCountOverride[postId] : initial;

  const handleToggleFavourite = async (postId: string, current: boolean, initialCount: number) => {
    const next = await toggleFavourite(postId, current);
    setFavouritedOverride(prev => ({ ...prev, [postId]: next }));
    setFavouritesCountOverride(prev => {
      const effectivePrev = prev[postId] !== undefined ? prev[postId] : initialCount;
      const newCount = next ? effectivePrev + (current ? 0 : 1) : effectivePrev - (current ? 1 : 0);
      return { ...prev, [postId]: Math.max(0, newCount) };
    });
  };

  const handleToggleBookmark = async (postId: string, current: boolean) => {
    const next = await toggleBookmark(postId, current);
    setBookmarkedOverride(prev => ({ ...prev, [postId]: next }));
  };
  const [currentStackId, setCurrentStackId] = useState<string | null>(null);

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

  if (text === null || text === undefined || text === '') {
    return { plainText: '', highlights: [] };
  }

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
    if (color === 'both') return `<mark style="background-color: #ddf2f4; padding: 0 2px;">${text}</mark>`;
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

  const handleOpenStackModal = (stackId: string) => {
    setCurrentStackId(stackId);
    setStackPostsModalOpen(true);
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
      style={{ display: 'flex', flexDirection: 'column', gap: '0rem', alignItems: 'center', width: '100%'}}
    >
      {relatedStacks.slice(0, maxStacksToShow).map((stack, index) => {
        const isHovered = hoveredIndex === index;
  
        const baseContentHtml = stack.topPost.rewrite.significant
          ? formatContent(stack.topPost.rewrite.content ?? '').__html
          : formatContent(stack.topPost.content ?? '').__html;

        const hoverHighlightHtml =
          stack.topPost.content_highlight && stack.topPost.rewrite?.content
            ? mergeHighlight(stack.topPost.content_highlight, stack.topPost.rewrite.content)
            : '';

        const contentToDisplay = isHovered
          ? hoverHighlightHtml && hoverHighlightHtml.trim().length > 0
            ? hoverHighlightHtml
            : baseContentHtml
          : baseContentHtml;

        return (
          <motion.div
            key={stack.stackId}
            variants={itemVariants(index)}
            style={{
              position: 'relative',
              margin: '20px 20px',
              marginTop: '1rem',
              width: '100%',
              borderRadius: '10px',
            }}
            onMouseEnter={() => {
              setHoveredIndex(index);
            }}
            
            
            onMouseLeave={() => {
              setHoveredIndex(null);
            }}
            
          >
            <Paper
              ref={(el) => {
                paperRefs.current[index] = el;
              }}
              style={{
                position: 'relative',
                width: '100%',
                backgroundColor: '#ffffff',
                zIndex: 5,
                borderRadius: '10px',
                margin: '0 auto',
                paddingTop: '40px',
                border: '2px solid rgb(156, 184, 255)',
                boxShadow:
                  stack.size !== null && stack.size > 1
                    ? 'none'
                    : '0 12px 24px rgba(0,0,0,0.18), 0 6px 12px rgba(0,0,0,0.12)',
                transition: 'box-shadow 150ms ease, border-color 150ms ease, transform 150ms ease',
                cursor: 'pointer'
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '10px',
                  left: '10px',
                  display: 'flex',
                  gap: '8px',
                  alignItems: 'center',
                  zIndex: 10,
                }}
              >
              <div
                style={{
                  background: '#E3ffe0',
                  color: '#555555',
                  borderRadius: '5px',
                  padding: '2px 6px',
                  fontWeight: 'bold',
                  fontSize: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  lineHeight: 1,
                }}
              >
                {iconMapping[stack.rel] || iconMapping['default']} {stack.rel}
              </div>
                {stack.topPost.rewrite.significant && (
                  <div
                    style={{
                      background: '#E0E6ff',
                      color: '2435A3',
                      borderRadius: '5px',
                      padding: '2px 6px',
                      fontWeight: 'bold',
                      fontSize: '10px',
                    }}
                  >
                    Modified by AI
                  </div>
                )}
              </div>
              <UnstyledButton
                onClick={() => handleNavigate(stack.topPost.id, stack.stackId)}
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
                style={{ paddingLeft: '54px', paddingRight: '1rem', cursor: 'pointer' }}
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
  
              <Divider style={{ marginTop: '0.5rem', marginLeft: '1rem', marginRight: '1rem' }} />
              <div style={{ paddingLeft: '1rem', paddingRight: '1rem' }}>
                <Group style={{ display: 'flex', justifyContent: 'space-between'}}>
                  <InteractionControl
                    icon={<IconMessageCircle size={20} />}
                    label={stack.topPost.replies_count}
                    ariaLabel="Replies"
                    onClick={() => handleNavigate(stack.topPost.id, stack.stackId)}
                  />
                  <InteractionControl
                    icon={isFavourited(stack.topPost.id, stack.topPost.favourited) ? <IconHeartFilled size={20} /> : <IconHeart size={20} />}
                    label={getFavouritesCount(stack.topPost.id, stack.topPost.favourites_count)}
                    ariaLabel="Favourites"
                    onClick={() => handleToggleFavourite(
                      stack.topPost.id,
                      isFavourited(stack.topPost.id, stack.topPost.favourited),
                      getFavouritesCount(stack.topPost.id, stack.topPost.favourites_count)
                    )}
                    active={isFavourited(stack.topPost.id, stack.topPost.favourited)}
                  />
                  <InteractionControl
                    icon={isBookmarked(stack.topPost.id, stack.topPost.bookmarked) ? <IconBookmarkFilled size={20} /> : <IconBookmark size={20} />}
                    ariaLabel="Bookmark"
                    onClick={() => handleToggleBookmark(stack.topPost.id, isBookmarked(stack.topPost.id, stack.topPost.bookmarked))}
                    active={isBookmarked(stack.topPost.id, stack.topPost.bookmarked)}
                  />
                  <InteractionControl
                    icon={<IconShare size={20} />}
                    ariaLabel="Share"
                    onClick={() => {
                      const url = `${window.location.origin}/posts/${stack.topPost.id}?stackId=${stack.stackId}`;
                      navigator.clipboard.writeText(url).catch(() => {});
                    }}
                  />
                </Group>
              </div>
              {stack.size !== null && stack.size > 1 && (
                <RelatedStackCount
                  count={stack.size}
                  onClick={() => handleOpenStackModal(stack.stackId)}
                />
              )}
            </Paper>
  
            {stack.size !== null && stack.size > 1 && (
              <>
                {[...Array(2)].map((_, idx) => (
                  <div
                    key={idx}
                    aria-hidden
                    style={{
                      position: 'absolute',
                      inset: 0,
                      transform: `translate(${6 - 3 * idx}px, ${8 - 4 * idx}px)`,
                      width: '100%',
                      backgroundColor: '#ffffff',
                      borderRadius: '10px',
                      zIndex: idx + 1,
                      pointerEvents: 'none',
                      border: '2px solid rgb(156, 184, 255)',
                      boxShadow: idx === 0
                        ? '0 12px 24px rgba(0,0,0,0.18), 0 6px 12px rgba(0,0,0,0.12)'
                        : 'none',
                      transition: 'box-shadow 150ms ease, border-color 150ms ease, transform 150ms ease',
                    }}
                  />
                ))}
              </>
            )}

          </motion.div>
        );
      })}
  
      <StackPostsModal
        isOpen={stackPostsModalOpen}
        onClose={() => setStackPostsModalOpen(false)}
        apiUrl={currentStackId ? `https://beta.stacky.social:3002/stacks/${currentStackId}/posts` : ''}
        stackId={currentStackId}
      />
    </motion.div>
  );
  
};

export default RelatedStacks;
