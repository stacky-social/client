"use client";

import React, { useRef, useEffect, useState } from 'react';
import { Paper, UnstyledButton, Group, Avatar, Text, Divider, Anchor } from '@mantine/core';
import { IconMessageCircle, IconHeart, IconHeartFilled, IconBookmark, IconBookmarkFilled, IconShare } from '@tabler/icons-react';
import { formatPostDate } from '../utils/formatPostDate';
import RelatedStackCount from './RelatedStackCount';
import { useRouter } from 'next/navigation';
import { notifications } from '@mantine/notifications';
import './RelatedStacks.css';
import { toggleFavourite, toggleBookmark } from '../utils/mastoActions';
import InteractionControl from './InteractionControl';

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
    acct?: string;
    username?: string;
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
  showupdate: boolean;
}

// Category icon/colour presentation lives in src/utils/categoryStyles.tsx
// (categoryIcon()/getCategoryColors()) — the legacy local copy was removed.

const RepliesStack: React.FC<RepliesStackProps> = ({ repliesStacks, cardWidth, onStackClick, showupdate }) => {
  const router = useRouter();
  const [maxStacksToShow, setMaxStacksToShow] = useState(4);
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
    // Optimistically reflect the toggle, then confirm/revert with the server result.
    const optimistic = !current;
    setFavouritedOverride(prev => ({ ...prev, [postId]: optimistic }));
    setFavouritesCountOverride(prev => {
      const effectivePrev = prev[postId] !== undefined ? prev[postId] : initialCount;
      const newCount = optimistic ? effectivePrev + 1 : effectivePrev - 1;
      return { ...prev, [postId]: Math.max(0, newCount) };
    });

    const result = await toggleFavourite(postId, current);
    if (!result.ok) {
      // Revert optimistic UI on failure.
      setFavouritedOverride(prev => ({ ...prev, [postId]: current }));
      setFavouritesCountOverride(prev => {
        const effectivePrev = prev[postId] !== undefined ? prev[postId] : initialCount;
        const reverted = optimistic ? effectivePrev - 1 : effectivePrev + 1;
        return { ...prev, [postId]: Math.max(0, reverted) };
      });
      notifications.show({
        title: 'Error',
        message: 'Could not update like. Please try again.',
        color: 'red',
      });
    }
  };

  const handleToggleBookmark = async (postId: string, current: boolean) => {
    // Optimistically reflect the toggle, then confirm/revert with the server result.
    setBookmarkedOverride(prev => ({ ...prev, [postId]: !current }));
    const result = await toggleBookmark(postId, current);
    if (!result.ok) {
      setBookmarkedOverride(prev => ({ ...prev, [postId]: current }));
      notifications.show({
        title: 'Error',
        message: 'Could not update bookmark. Please try again.',
        color: 'red',
      });
    }
  };
  const [cardHeights, setCardHeights] = useState<number[]>([]);
  const paperRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const heights = paperRefs.current.map(ref => ref?.offsetHeight || 0);
    setCardHeights(heights);
    heights.forEach((height, index) => {
      console.log(`Paper ${index} height:`, height);
      console.log(`Stacked div ${index} height:`, height);
    });
  }, [repliesStacks]);

  // No modal: clicking the count will navigate

  const handleNavigate = (postId: string, newStackId: string) => {
    const url = `/posts/${postId}?stackId=${newStackId || ''}`;
    router.push(url);
  };

  const handleNavigateToUser = (e: React.MouseEvent, account: { acct?: string; username?: string; display_name: string }) => {
    e.preventDefault();
    e.stopPropagation();
    const profileHandle = account.acct || account.username || account.display_name;
    router.push(`/user/${profileHandle}`);
  };

  const handleClick = (postId: string, stackId: string) => {
    handleNavigate(postId, stackId);
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
            marginTop: '0px',
            width: '80%',
          }}
        >
          <Paper
            ref={(el) => {
              paperRefs.current[index] = el;
            }}
            style={{
              position: 'relative',
              width: '100%',
              backgroundColor: '#f6f3e1',
              zIndex: 5,
              boxShadow: '0 3px 10px rgba(0,0,0,0.1)',
              margin: '0 auto',
              paddingTop: '20px',
              cursor: 'pointer'
            }}

          >
            {stack.topPost.rewrite.significant&&  (
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
            )}
            <UnstyledButton
              onClick={() => handleClick(stack.topPost.id, stack.stackId)}
              style={{ width: '100%' }}
            >
              <Group style={{ padding: '0 20px' }}>
                <UnstyledButton
                  onClick={(e) => handleNavigateToUser(e, stack.topPost.account)}
                  className="avatarHoverDim"
                >
                  <Avatar src={stack.topPost.account.avatar} alt={stack.topPost.account.display_name} radius="xl" />
                </UnstyledButton>
                <div>
                  <Anchor
                    component="button"
                    onClick={(e) => handleNavigateToUser(e, stack.topPost.account)}
                    underline="hover"
                    style={{ color: '#011445', fontWeight: 700, fontSize: 'var(--mantine-font-size-md)' }}
                  >
                    {stack.topPost.account.display_name}
                  </Anchor>
                  <Text size="xs" c="dimmed">
                    {formatPostDate(stack.topPost.created_at)}
                  </Text>
                </div>
              </Group>

            <div
              style={{
                paddingTop: '1rem',
                paddingLeft: '1rem',
                paddingRight: '1rem',
                cursor: 'pointer'
              }}

            >
                {stack.topPost.content_rewritten ? (
                  <Text c="#011445" dangerouslySetInnerHTML={{ __html: stack.topPost.rewrite.content }} />
                ) : (
                  <Text c="#011445" dangerouslySetInnerHTML={{ __html: stack.topPost.content }} />
                )}
              </div>

            </UnstyledButton>
            <Divider my="md" c="#011445" />
            <Group style={{ display: 'flex', justifyContent: 'space-between', padding: '0 20px' }}>
              <InteractionControl
                icon={<IconMessageCircle size={20} />}
                label={stack.topPost.replies_count}
                ariaLabel="Replies"
                onClick={() => handleClick(stack.topPost.id, stack.stackId)}
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
                  navigator.clipboard.writeText(url)
                    .then(() => {
                      notifications.show({
                        title: 'Link copied',
                        message: 'The link was copied to your clipboard',
                        color: 'green',
                      });
                    })
                    .catch(() => {
                      notifications.show({
                        title: 'Copy failed',
                        message: 'Could not copy the link',
                        color: 'red',
                      });
                    });
                }}
              />
            </Group>
            {stack.size !== null && stack.size > 1 && (
              <RelatedStackCount count={stack.size} onClick={() => handleClick(stack.topPost.id, stack.stackId)} />
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
                  backgroundColor: '#45a99e',
                  zIndex: idx + 1,
                  boxShadow: '0 3px 10px rgba(0,0,0,0.1)',
                  border: '1.5px solid white',
                }}
              />
            ))}
        </div>
      ))}
    </div>
  );
};

export default RepliesStack;
