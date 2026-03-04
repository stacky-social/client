import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Text, Avatar, Group, Paper, UnstyledButton, Divider, Anchor } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconHeart, IconBookmark, IconNote, IconMessageCircle, IconHeartFilled, IconBookmarkFilled } from '@tabler/icons-react';
import { format, formatDistanceToNow } from 'date-fns';
import StackCount from '../StackCount';
import axios from 'axios';
import AnnotationModal from '../AnnotationModal';
import { PreviewCardType } from '../../types/PostType';
import InteractionControl from '../InteractionControl';

type PreviewCard = PreviewCardType;

const MastodonInstanceUrl = 'https://beta.stacky.social';

interface CleanedPost {
  html: string;
  publishedDate: string | null;
}

/** Extract "Published" date from post HTML and clean up empty tags. */
function cleanPostHtml(html: string): CleanedPost {
  let cleaned = html;
  let publishedDate: string | null = null;

  // Extract "Published: DATE" and remove from text
  cleaned = cleaned.replace(/Published:\s*(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)/g, (_match, iso) => {
    try {
      publishedDate = format(new Date(iso), 'MMM d, yyyy');
    } catch {
      publishedDate = iso;
    }
    return '';
  });
  // Also handle already-formatted "Published: Mon DD, YYYY"
  if (!publishedDate) {
    cleaned = cleaned.replace(/Published:\s*([A-Z][a-z]+ \d{1,2}, \d{4})/g, (_match, date) => {
      publishedDate = date;
      return '';
    });
  }

  // Collapse leftover empty <p></p> tags
  cleaned = cleaned.replace(/<p>\s*<\/p>/g, '');

  return { html: cleaned, publishedDate };
}



interface PostProps {
  id: string;
  text: string;
  author: string;
  account: string;
  avatar: string;
  repliesCount: number;
  createdAt: string;
  stackCount: number | null;
  favouritesCount: number;
  favourited: boolean;
  bookmarked: boolean;
  mediaAttachments: string[];
  onStackIconClick: (relatedStacks: any[], postId: string, position: { top: number, height: number }) => void;
  setIsModalOpen: (isOpen: boolean) => void;
  setIsExpandModalOpen: (isOpen: boolean) => void;
  relatedStacks: any[];
  activePostId: string | null;
  setActivePostId: (id: string | null) => void;
  initialCard?: PreviewCard | null;
  
}

export default function Post({
  id,
  text,
  author,
  account,
  avatar,
  repliesCount,
  createdAt,
  stackCount,
  favouritesCount,
  favourited,
  bookmarked,
  onStackIconClick,
  relatedStacks,
  activePostId,
  setActivePostId,
  initialCard,
}: PostProps) {
  const router = useRouter();
  const [cardHeight, setCardHeight] = useState(0);
  const paperRef = useRef<HTMLDivElement>(null);

  const [isExpandModalOpen, setIsExpandModalOpen] = useState(false);

  const [liked, setLiked] = useState(favourited);
  const [bookmarkedState, setBookmarkedState] = useState(bookmarked);
  const [likeCount, setLikeCount] = useState(favouritesCount);
  const [replyCount, setReplyCount] = useState(repliesCount);
  const [annotationModalOpen, setAnnotationModalOpen] = useState(false);
  const [mediaAttachments, setMediaAttachments] = useState<string[]>([]);
  const isActive = activePostId === id;
  const [isExpanded, setIsExpanded] = useState(isActive);
  const [isTextExpanded, setIsTextExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);

  const [previewCards, setPreviewCards] = useState<PreviewCard[]>(initialCard ? [initialCard] : []);
  const [tempRelatedStacks, setTempRelatedStacks] = useState<any[]>(relatedStacks);
  const { html: displayText, publishedDate } = cleanPostHtml(text);

  const [isOverflowing, setIsOverflowing] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = textRef.current;
    if (!element) return;

    if (isTextExpanded) {
      setIsOverflowing(false);
      return;
    }

    setIsOverflowing(element.scrollHeight > element.clientHeight);
  }, [text, isTextExpanded]);
  useEffect(() => {
    setTempRelatedStacks(relatedStacks);
  }, [relatedStacks]);

  useEffect(() => {
    if (initialCard) {
      setPreviewCards([initialCard]);
    }
  }, [initialCard]);

  useEffect(() => {
    if (paperRef.current) {
      setCardHeight(paperRef.current.clientHeight);
    }
  }, [text, mediaAttachments, previewCards]);

  useEffect(() => {
    fetchPostData();
  }, []);

  useEffect(() => {
    // Sync isExpanded with isActive state
    setIsExpanded(isActive);
  }, [isActive]);


  const handleNavigate = () => {
    const url = `/posts/${id}`;
    localStorage.setItem('relatedStacks', JSON.stringify(tempRelatedStacks));

    localStorage.setItem('relatedStacksSize', JSON.stringify(stackCount));
    sessionStorage.setItem(`previousPath:${url}`, window.location.pathname);
    sessionStorage.setItem(`scrollY:${window.location.pathname}`, String(window.scrollY));
    router.push(url);
  };

  const handleReply = () => {
    const url = `/posts/${id}`;
    sessionStorage.setItem(`previousPath:${url}`, window.location.pathname);
    sessionStorage.setItem(`scrollY:${window.location.pathname}`, String(window.scrollY));
    router.push(url);
  };

  const getAccessToken = () => {
    return localStorage.getItem('accessToken');
  };

  const fetchPostData = async () => {
    const accessToken = getAccessToken();
    if (!accessToken) return;

    try {
      const response = await axios.get(`${MastodonInstanceUrl}/api/v1/statuses/${id}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const data = response.data;
      const mediaAttachments = data.media_attachments.map((attachment: any) => attachment.url);
      setLikeCount(data.favourites_count);
      setReplyCount(data.replies_count);
      setLiked(data.favourited);
      setBookmarkedState(data.bookmarked);
      setMediaAttachments(mediaAttachments);

      const card = data.card;
      if (card) {
        const normalized: PreviewCard = {
          title: card.title || '',
          description: card.description || '',
          image: card.image || undefined,
          url: card.url,
        };
        setPreviewCards([normalized]);
      } else {
        setPreviewCards([]);
      }
    } catch (error) {
      console.error('Error fetching post data:', error);
    }
  };

  const handleNavigateToUser = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!account) return;
    const url = `/user/${account}`;
    router.push(url);
  };

  const handleLike = async () => {
    const accessToken = getAccessToken();
    if (!accessToken) return;

    try {
      if (liked) {
        await axios.post(`${MastodonInstanceUrl}/api/v1/statuses/${id}/unfavourite`, {}, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
      } else {
        await axios.post(`${MastodonInstanceUrl}/api/v1/statuses/${id}/favourite`, {}, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
      }
      await fetchPostData();
    } catch (error) {
      console.error('Error liking post:', error);
    }
  };

  const handleSave = async () => {
    const accessToken = getAccessToken();
    if (!accessToken) return;

    try {
      if (bookmarkedState) {
        await axios.post(`${MastodonInstanceUrl}/api/v1/statuses/${id}/unbookmark`, {}, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
      } else {
        await axios.post(`${MastodonInstanceUrl}/api/v1/statuses/${id}/bookmark`, {}, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
      }
      await fetchPostData();
    } catch (error) {
      console.error('Error bookmarking post:', error);
    }
  };

  const handleAnnotation = () => {
    setAnnotationModalOpen(true);
  };

  const handleStackCountClick = async () => {
    setIsExpanded(true);
    const position = paperRef.current ? paperRef.current.getBoundingClientRect() : { top: 0, height: 0 };
    const adjustedPosition = { top: position.top + window.scrollY, height: position.height };

    // Set active post first to lock the highlight
    setActivePostId(id);

    let stacks = tempRelatedStacks;
    // If stacks are missing, fetch them
    if (!Array.isArray(stacks) || stacks.length === 0) {
      try {
        const accessToken = getAccessToken();
        if (accessToken) {
          const response = await axios.get(`${MastodonInstanceUrl}:3002/stacks/${id}/related`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          stacks = response.data.relatedStacks || [];
          setTempRelatedStacks(stacks);
        }
      } catch (error) {
        console.error('Failed to fetch related stacks on click:', error);
        notifications.show({
          color: 'red',
          title: 'Failed to load stacks',
          message: 'Please try again later.',
        });
      }
    }
    onStackIconClick(Array.isArray(stacks) ? stacks : [], id, adjustedPosition);
  };

  const handleStackClick = (index: number) => {
    const newRelatedStacks = [...tempRelatedStacks];
    const [clickedStack] = newRelatedStacks.splice(index, 1);
    newRelatedStacks.unshift(clickedStack);
    setTempRelatedStacks(newRelatedStacks);

    const position = paperRef.current ? paperRef.current.getBoundingClientRect() : { top: 0, height: 0 };
    const adjustedPosition = { top: position.top + window.scrollY, height: position.height };
    onStackIconClick(newRelatedStacks, id, adjustedPosition);
  };

  const handleLinkClick = (e: MouseEvent) => {
    e.preventDefault();
    const target = e.target as HTMLAnchorElement;
    if (target && target.href) {
      window.open(target.href, '_blank');
    }
  };

  const handleExpandText = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();
    setIsTextExpanded(true);
    setIsOverflowing(false);
  };

  const handleSingleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleNavigate();
  };

  const handleMouseUp = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().length === 0) {
      handleNavigate();
    }
  };

  useEffect(() => {
    const container = textRef.current;
    if (!container) return;
    const links = container.querySelectorAll('a');
    links.forEach(link => {
      (link as HTMLElement).style.color = '#5a71a8';
      (link as HTMLElement).style.textDecoration = 'underline';
      link.addEventListener('click', handleLinkClick as EventListener);
    });
    return () => {
      links.forEach(link => {
        link.removeEventListener('click', handleLinkClick as EventListener);
      });
    };
  }, [text, displayText]);

  return (
    <div style={{ position: 'relative', marginBottom: '3rem'}}>
      <Paper
        ref={paperRef}
        style={{
          position: 'relative',
          width: "100%",
          backgroundColor: '#fff',
          zIndex: 5,
          borderRadius: '10px', // 左上角圆角
          border: isActive ? '2px solid rgb(156, 184, 255)' : '2px solid #e7e7e7',
          boxShadow: isActive ? 'rgba(0, 0, 0, 0.18) 0px 12px 24px, rgba(0, 0, 0, 0.12) 0px 6px 12px' : 'none',
          transform: isActive ? 'translateY(-2px)' : 'none',
          transition: 'box-shadow 150ms ease, border-color 150ms ease, transform 150ms ease',
          paddingLeft: '1rem',
          paddingRight: '1rem',
          paddingTop: '1rem',
          cursor: 'pointer'
        }}
        onMouseEnter={() => { setHovered(true); }}
        onMouseLeave={() => { setHovered(false); }}
      >

{stackCount !== 0 && (
  <UnstyledButton
    onClick={(event) => {
      event.stopPropagation();
      handleStackCountClick();
    }}
    data-stack-count
  >
    <StackCount
      count={stackCount}
      onClick={handleStackCountClick}
      onStackClick={handleStackClick}
      relatedStacks={tempRelatedStacks}
      expanded={isExpanded}
      cardHeight={cardHeight}
    />
  </UnstyledButton>
)}

        <div
          onClick={handleSingleClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleNavigate();
            }
          }}
          role="button"
          tabIndex={0}
          style={{ width: '100%', cursor: 'pointer' }}
        >
          <Group>
            <UnstyledButton onClick={handleNavigateToUser} className="avatarHoverDim">
              <Avatar src={avatar} alt={author} radius="xl" />
            </UnstyledButton>
            <div>
              <Anchor
                component="button"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  handleNavigateToUser(e);
                }}
                underline="hover"
                style={{ color: '#011445', fontWeight: 700, fontSize: 'var(--mantine-font-size-md)' }}
              >
                {author}
              </Anchor>
              <Text size="xs" c="dimmed">{formatDistanceToNow(new Date(createdAt))} ago</Text>
            </div>
          </Group>
        </div>

        <div
          style={{ paddingLeft: '3rem', paddingRight:'3rem', cursor: 'pointer'}}
          onMouseUp={handleMouseUp}
        >
          <div>
      <div
        ref={textRef}
        style={{
          display: isTextExpanded ? 'block' : '-webkit-box',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: isTextExpanded ? undefined : 5,
          overflow: isTextExpanded ? 'visible' : 'hidden',
          textOverflow: isTextExpanded ? 'unset' : 'ellipsis',
          marginTop: '0px',
          lineHeight: '1.5',
          color: '#011445'
        }}
        dangerouslySetInnerHTML={{ __html: displayText }}
      />
      {isOverflowing && (
        <Anchor
          component="button"
          type="button"
          size="sm"
          underline="hover"
          styles={(theme) => ({
            root: {
              padding: 0,
              background: 'none',
              color: '#5a71a8',
              fontWeight: 600,
              cursor: 'pointer',
              '&:hover': {
                color: theme.colors.blue[7],
              },
            },
          })}
          onClick={handleExpandText}
          onMouseDown={(event) => event.stopPropagation()}
          onMouseUp={(event) => event.stopPropagation()}
        >
          Read more
        </Anchor>
      )}
    </div>
          {mediaAttachments.length > 0 && (
            <div style={{ paddingLeft: '3rem', paddingRight: '4rem', paddingTop: '1rem' }}>
              {mediaAttachments.map((url, index) => (
                <img key={index} src={url} alt={`Attachment ${index + 1}`} style={{ width: '100%', marginBottom: '10px' }} />
              ))}
            </div>
          )}

          {previewCards.slice(0, 1).map((card, index) =>
            card.image ? (
              <a
                key={index}
                href={card.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                onMouseUp={(e) => e.stopPropagation()}
                style={{ display: 'block', marginTop: '0.5rem', marginRight: '0.5rem' }}
              >
                <img
                  src={card.image}
                  alt={card.title}
                  style={{ width: '100%', borderRadius: '8px', display: 'block' }}
                />
              </a>
            ) : null
          )}
          {publishedDate && (
            <Text size="xs" c="dimmed" style={{ marginTop: '0.5rem' }}>
              Published: {publishedDate}
            </Text>
          )}
        </div>

        <Divider style={{ marginTop:'1.5rem'}}/>
        <div style={{ paddingLeft: '3rem', paddingRight: '3rem' }}>
          <Group style={{ display: 'flex', justifyContent: 'space-between', paddingTop:'0.1rem', paddingBottom:'0.1rem', marginBottom: stackCount !== null && stackCount > 1 ? '0px' : '0px' }}>
            <InteractionControl
              icon={<IconMessageCircle size={20} />}
              label={replyCount}
              ariaLabel="Reply"
              onClick={handleReply}
            />
            <InteractionControl
              icon={liked ? <IconHeartFilled size={20} /> : <IconHeart size={20} />}
              label={likeCount}
              ariaLabel="Like"
            onClick={handleLike}
            active={liked}
            />
            <InteractionControl
              icon={bookmarkedState ? <IconBookmarkFilled size={20} /> : <IconBookmark size={20} />}
              ariaLabel="Bookmark"
            onClick={handleSave}
            active={bookmarkedState}
            />
            <InteractionControl
              icon={<IconNote size={20} />}
              ariaLabel="Annotate"
              onClick={handleAnnotation}
            />
          </Group>
        </div>
      </Paper>
      <AnnotationModal
        isOpen={annotationModalOpen}
        onClose={() => setAnnotationModalOpen(false)}
        stackId={id}
      />
    </div>
  );
}
