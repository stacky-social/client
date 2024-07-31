import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Text, Avatar, Group, Paper, UnstyledButton, Button, Divider } from '@mantine/core';
import { IconHeart, IconBookmark, IconNote, IconMessageCircle, IconHeartFilled, IconBookmarkFilled, IconLink } from '@tabler/icons-react';
import { formatDistanceToNow } from 'date-fns';
import StackCount from '../StackCount';
import axios from 'axios';
import AnnotationModal from '../AnnotationModal';
import { motion, AnimatePresence } from 'framer-motion';

interface PreviewCard {
  title: string;
  description: string;
  image?: string;
  url: string;
}

const MastodonInstanceUrl = 'https://beta.stacky.social';

const extractLinks = (text: string): string[] => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/html');
  const anchors = doc.querySelectorAll('a:not(.mention.hashtag)') as NodeListOf<HTMLAnchorElement>;
  return Array.from(anchors)
    .map(anchor => anchor.href)
    .filter(href => href.startsWith('http')); 
};

const fetchPreviewCard = async (url: string): Promise<PreviewCard | null> => {
  try {
    const response = await axios.get(`https://api.microlink.io?url=${encodeURIComponent(url)}`);
    return {
      title: response.data.data.title,
      description: response.data.data.description,
      image: response.data.data.image?.url,
      url: url
    };
  } catch (error) {
    console.error('Error fetching preview card:', error);
    return null;
  }
};

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
  const [isExpanded, setIsExpanded] = useState(false);

  const [previewCards, setPreviewCards] = useState<PreviewCard[]>([]);
  const [tempRelatedStacks, setTempRelatedStacks] = useState<any[]>(relatedStacks);

  useEffect(() => {
    setTempRelatedStacks(relatedStacks);
  }, [relatedStacks]);

  useEffect(() => {
    if (paperRef.current) {
      setCardHeight(paperRef.current.clientHeight);
    }
  }, [text, mediaAttachments, previewCards]);

  useEffect(() => {
    fetchPostData();
  }, []);

  useEffect(() => {
    if (activePostId !== id && isExpanded) {
      setIsExpanded(false);
    }
  }, [activePostId]);

  useEffect(() => {
    if (activePostId === id) {
      handleStackCountClick();
    }
  }, [activePostId]);

  const handleNavigate = () => {
    const url = `/posts/${id}`;
    localStorage.setItem('relatedStacks', JSON.stringify(tempRelatedStacks));
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

      const links = extractLinks(data.content);

      const previewCardsPromises = links.map(link => fetchPreviewCard(link));
      const previewCards = await Promise.all(previewCardsPromises);
      setPreviewCards(previewCards.filter(card => card !== null) as PreviewCard[]);
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

  const handleStackCountClick = () => {
    setIsExpanded(true);
    const position = paperRef.current ? paperRef.current.getBoundingClientRect() : { top: 0, height: 0 };
    const adjustedPosition = { top: position.top + window.scrollY, height: position.height };

    onStackIconClick(tempRelatedStacks, id, adjustedPosition);
    setActivePostId(id); 
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

  let clickTimeout: NodeJS.Timeout;
  let preventClick = false;

  const handleSingleClick = (e: React.MouseEvent) => {
    e.stopPropagation();  // 防止事件冒泡
    clickTimeout = setTimeout(() => {
      if (!preventClick) {
        handleNavigate();
      }
      preventClick = false;
    }, 300); // 延迟以区分单击和双击
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();  // 防止事件冒泡
    clearTimeout(clickTimeout);  // 清除单击事件的计时器
    preventClick = true;
    handleStackCountClick();
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
    <div style={{ position: 'relative', marginLeft: '15px', marginBottom: '3rem',marginTop: '3rem', width: "90%",boxShadow: '0 10px 10px rgba(0,0,0,0.1)'}}>
      <Paper
        ref={paperRef}
        style={{
          position: 'relative',
          width: "100%",
          backgroundColor: isExpanded ? '#f6f3e1' : '#fff',
          zIndex: 5,
          // boxShadow: '0 0px 0px rgba(0,0,0,0.1)', // 调整阴影，只在其他三边显示
          // borderRadius: '8px', // 全局圆角
          borderRadius: '0px', // 左上角圆角
          //borderTopRightRadius: stackCount !== null && stackCount > 1  ?'0px' : '8px', // 右上角不圆角
          paddingLeft: '1rem',
          paddingRight: '1rem',
          paddingTop: '1rem'
        }}

        // withBorder
        onMouseEnter={() => {
          if (!isExpanded && paperRef.current) {
            paperRef.current.style.backgroundColor = 'rgba(245, 245, 245)';
          }
        }}
        onMouseLeave={() => {
          if (!isExpanded && paperRef.current) {
            paperRef.current.style.backgroundColor = 'rgba(255, 255, 255, 1)';
          }
        }}
      >
        {
          <UnstyledButton onClick={handleStackCountClick}>
            <StackCount
              count={stackCount}
              onClick={handleStackCountClick}
              onStackClick={handleStackClick}
              relatedStacks={tempRelatedStacks}
              expanded={isExpanded}
              cardHeight = {cardHeight}
            />
          </UnstyledButton>
       }
        <UnstyledButton
          onClick={handleSingleClick} 
          onDoubleClick={handleDoubleClick} 
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
          style={{ paddingLeft: '3rem', paddingRight:'1rem'}}
          onMouseUp={handleMouseUp}
        >
          <div>
            <Text
              c="#011445" 
              size="1rem" 
              className="post-content" 
              style={{marginTop:'0px',lineHeight: '1.5'}}
              dangerouslySetInnerHTML={{ __html: text }} 
            />
          </div>

          {mediaAttachments.length > 0 && (
            <div style={{ paddingLeft: '3rem', paddingRight: '4rem', paddingTop: '1rem' }}>
              {mediaAttachments.map((url, index) => (
                <img key={index} src={url} alt={`Attachment ${index + 1}`} style={{ width: '100%', marginBottom: '10px' }} />
              ))}
            </div>
          )}

          {previewCards.slice(0,1).map((card, index) => (
            <div key={index} style={{
              display: 'flex',
              alignItems: 'flex-start',
              border: '1px solid rgba(0, 0, 0, 0.1)',
              borderRadius: '15px',
              overflow: 'hidden',
              boxShadow: '0 0px 0px rgba(0, 0, 0, 0.1)',
              marginTop: '0.5rem',
              marginRight: '0.5rem',
            }} onClick={(e) => { e.stopPropagation(); window.open(card.url, '_blank'); }}>
              {card.image && (
                <img src={card.image} alt={card.title} style={{ width: '150px', margin: '10px' }} />
              )}
              <div>
                <Text c="#011445" fw="700" size="sm">{card.title}</Text>
                <Text size="xs" c="dimmed">{card.description}</Text>
              </div>
            </div>
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
      {stackCount != null && stackCount > 1 && (
        !isExpanded && [...Array(3)].map((_, index) => (
          <div
            key={index}
            style={{
              position: 'absolute',
              top: `${16 - 5 * (index)}px`,
              right: `${-16 + 5 * (index)}px`,
              width: "100%",
              height: `${cardHeight}px`,
              backgroundColor: '#5a71a8',
              border: '0.5px solid #FCFBF5',
            }}
          />
        ))
      )}

      <AnnotationModal
        isOpen={annotationModalOpen}
        onClose={() => setAnnotationModalOpen(false)}
        stackId={id}
      />
    </div>
  );
}
