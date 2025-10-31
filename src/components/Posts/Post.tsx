import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Text, Avatar, Group, Paper, UnstyledButton, Button, Divider, Anchor } from '@mantine/core';
import { IconHeart, IconBookmark, IconNote, IconMessageCircle, IconHeartFilled, IconBookmarkFilled, IconLink } from '@tabler/icons-react';
import { formatDistanceToNow } from 'date-fns';
import StackCount from '../StackCount';
import axios from 'axios';
import AnnotationModal from '../AnnotationModal';
import LinkPreviewCard from '../LinkPreviewCard';
import { PreviewCardType } from '../../types/PostType';

type PreviewCard = PreviewCardType;

const MastodonInstanceUrl = 'https://beta.stacky.social';

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
    router.push(url);
  };

  const handleReply = () => {
    router.push(`/posts/${id}`);
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

  const handleCopyLink = () => {
    const url = `${window.location.origin}/posts/${id}`;
    navigator.clipboard.writeText(url).then(() => {

    }).catch((error) => {
      console.error('Error copying link:', error);
    });
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
    const links = document.querySelectorAll('.post-content a');
    links.forEach(link => {
      link.addEventListener('click', handleLinkClick as EventListener);
    });
    return () => {
      links.forEach(link => {
        link.removeEventListener('click', handleLinkClick as EventListener);
      });
    };
  }, [text]);

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

        <UnstyledButton
          onClick={handleSingleClick}
          style={{ width: '100%' }}
        >
          <Group>
            <UnstyledButton onClick={handleNavigateToUser}>
              <Avatar src={avatar} alt={author} radius="xl" />
            </UnstyledButton>
            <div>
              <Text size="md" fw={700} c="#011445">{author}</Text>
              <Text size="xs" c="dimmed">{formatDistanceToNow(new Date(createdAt))} ago</Text>
            </div>
          </Group>
        </UnstyledButton>

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
        dangerouslySetInnerHTML={{ __html: text }}
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

          {previewCards.slice(0, 1).map((card, index) => (
            <LinkPreviewCard
              key={index}
              url={card.url}
              title={card.title}
              description={card.description}
              imageUrl={card.image}
            />
          ))}
        </div>

        <Divider style={{ marginTop:'1.5rem'}}/>
        <Group style={{ display: 'flex', justifyContent: 'space-between', paddingTop:'0.1rem', paddingBottom:'0.1rem', marginBottom: stackCount !== null && stackCount > 1 ? '0px' : '0px' }}>
          <Button variant="subtle" size="sm" radius="lg" onClick={handleReply} style={{ display: 'flex', alignItems: 'center' }}>
            <IconMessageCircle size={20} style={{ color: '#002379' }} /> <Text ml={4} style={{ color: '#002379' }}>{replyCount}</Text>
          </Button>
          <Button variant="subtle" size="sm" radius="lg" onClick={handleLike} style={{ display: 'flex', alignItems: 'center' }}>
            {liked ? <IconHeartFilled size={20} style={{ color: '#002379' }} /> : <IconHeart size={20} style={{ color: '#002379' }} />} <Text ml={4} style={{ color: '#002379' }}>{likeCount}</Text>
          </Button>
          <Button variant="subtle" size="sm" radius="lg" onClick={handleSave} style={{ display: 'flex', alignItems: 'center' }}>
            {bookmarkedState ? <IconBookmarkFilled size={20} style={{ color: '#002379' }} /> : <IconBookmark size={20} style={{ color: '#002379' }} />}
          </Button>
          <Button variant="subtle" size="sm" radius="lg" onClick={handleAnnotation} style={{ display: 'flex', alignItems: 'center' }}>
            <IconNote size={20} style={{ color: '#002379' }} />
          </Button>
          <Button variant="subtle" size="sm" radius="lg" onClick={handleCopyLink} style={{ display: 'flex', alignItems: 'center' }}>
            <IconLink size={20} style={{ color: '#002379' }} />
          </Button>
        </Group>
      </Paper>
      <AnnotationModal
        isOpen={annotationModalOpen}
        onClose={() => setAnnotationModalOpen(false)}
        stackId={id}
      />
    </div>
  );
}
