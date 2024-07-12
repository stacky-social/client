import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Text, Avatar, Group, Paper, UnstyledButton, Button, Divider } from '@mantine/core';
import { IconHeart, IconBookmark, IconNote, IconMessageCircle, IconHeartFilled, IconBookmarkFilled } from '@tabler/icons-react';
import { formatDistanceToNow } from 'date-fns';
import StackCount from '../StackCount';
import axios from 'axios';
import AnnotationModal from '../AnnotationModal';



const fakeRelatedStacks = [
  {
    stackId: "stack-1",
    rel: "disagree",
    size: 20,
    topPost: {
      id: "post-1",
      created_at: new Date().toISOString(),
      replies_count: 5,
      favourites_count: 10,
      favourited: false,
      bookmarked: false,
      content: "This is a fake post content for stack 1",
      account: {
        avatar: "https://via.placeholder.com/150",
        display_name: "User 1",
      },
    },
  },
  {
    stackId: "stack-2",
    rel: "prediction",
    size: 15,
    topPost: {
      id: "post-2",
      created_at: new Date().toISOString(),
      replies_count: 3,
      favourites_count: 7,
      favourited: true,
      bookmarked: false,
      content: "This is a fake post content for stack 2",
      account: {
        avatar: "https://via.placeholder.com/150",
        display_name: "User 2",
      },
    },
  },
  {
    stackId: "stack-3",
    rel: "funny",
    size: 15,
    topPost: {
      id: "post-2",
      created_at: new Date().toISOString(),
      replies_count: 3,
      favourites_count: 7,
      favourited: true,
      bookmarked: false,
      content: "This is a fake post content for stack 2",
      account: {
        avatar: "https://via.placeholder.com/150",
        display_name: "User 2",
      },
    },
  },
  {
    stackId: "stack-4",
    rel: "evidence",
    size: 15,
    topPost: {
      id: "post-2",
      created_at: new Date().toISOString(),
      replies_count: 3,
      favourites_count: 7,
      favourited: true,
      bookmarked: false,
      content: "This is a fake post content for stack 2",
      account: {
        avatar: "https://via.placeholder.com/150",
        display_name: "User 2",
      },
    },
  }
];

const MastodonInstanceUrl = 'https://beta.stacky.social';

interface PreviewCard {
  title: string;
  description: string;
  image?: string;
  url: string;
}

const extractLinks = (text: string): string[] => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/html');
  const anchors = doc.querySelectorAll('a:not(.mention.hashtag)') as NodeListOf<HTMLAnchorElement>; // 明确指定为 HTMLAnchorElement 类型并排除hashtag链接
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
  account:string;
  avatar: string;
  repliesCount: number;
  createdAt: string;
  stackCount: number | null;
  stackId: string | null;
  favouritesCount: number;
  favourited: boolean;
  bookmarked: boolean;
  mediaAttachments: string[];
  onStackIconClick: (relatedStacks: any[], postId: string, position: { top: number, height: number }) => void;
  setIsModalOpen: (isOpen: boolean) => void;
  setIsExpandModalOpen: (isOpen: boolean) => void;
}



export default function Post({ id, text, author, account,avatar, repliesCount, createdAt, stackCount, stackId, favouritesCount, favourited, bookmarked, onStackIconClick}: PostProps) {
  const router = useRouter();
  const [cardHeight, setCardHeight] = useState(0);
  const paperRef = useRef<HTMLDivElement>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isExpandModalOpen, setIsExpandModalOpen] = useState(false);

  const [liked, setLiked] = useState(favourited);
  const [bookmarkedState, setBookmarkedState] = useState(bookmarked);
  const [likeCount, setLikeCount] = useState(favouritesCount);
  const [replyCount, setReplyCount] = useState(repliesCount);
  const [annotationModalOpen, setAnnotationModalOpen] = useState(false);
  const [mediaAttachments, setMediaAttachments] = useState<string[]>([]);
  const [relatedStacks, setRelatedStacks] = useState<Array<{ rel: string, stackId: string, size: number }>>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  const [previewCards, setPreviewCards] = useState<PreviewCard[]>([]);
  useEffect(() => {
    if (paperRef.current) {
      setCardHeight(paperRef.current.clientHeight);
      
    }
  }, [text, mediaAttachments, previewCards]);

  useEffect(() => {
    fetchPostData();
  }, []);

  useEffect(() => {
    if (isExpandModalOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (!isExpandModalOpen && paperRef.current && !paperRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isExpandModalOpen]);

  const handleNavigate = () => {
    const url = `/posts/${id}?stackId=${stackId || ''}`;
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
      await fetchPostData(); // Fetch the updated count from the API
    } catch (error) {
      console.error('Error bookmarking post:', error);
    }
  };

  const handleAnnotation = () => {
    setAnnotationModalOpen(true);
  };

  const handleStackCountClick = () => {
    const newRelatedStacks = fakeRelatedStacks;
    setRelatedStacks(newRelatedStacks);
    setIsExpanded(true);
    const position = paperRef.current ? paperRef.current.getBoundingClientRect() : { top: 0, height: 0 };
    const adjustedPosition = { top: position.top + window.scrollY, height: position.height };
    onStackIconClick(newRelatedStacks, id, adjustedPosition);
  };

  const handleStackClick = (index: number) => {
    console.log('Clicked stack index:', index);
    const newRelatedStacks = [...relatedStacks];
    const [clickedStack] = newRelatedStacks.splice(index, 1);
    console.log('Clicked stack:', clickedStack);

    newRelatedStacks.unshift(clickedStack);
    setRelatedStacks(newRelatedStacks);
    console.log('Updated related stacks:', newRelatedStacks);

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

  useEffect(() => {
    const links = document.querySelectorAll('.post-content a');
    console.log('Links:', links);
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
    <div style={{ position: 'relative', margin: '15px', marginBottom: '2rem', width: "90%" }}>
      <Paper
        ref={paperRef}
        style={{
          position: 'relative',
          width: "100%",
          backgroundColor: '#fff',
          zIndex: 5,
          boxShadow: '0 3px 10px rgba(0,0,0,0.1)',
          borderRadius: '8px',
          padding: '10px ',
        }}
        withBorder
        onMouseEnter={() => {
          if (paperRef.current) {
            paperRef.current.style.backgroundColor = 'rgba(245, 245, 245)';
          }
        }}
        onMouseLeave={() => {
          if (paperRef.current) {
            paperRef.current.style.backgroundColor = 'rgba(255, 255, 255, 1)';
          }
        }}
      >
        <UnstyledButton onClick={handleNavigate} style={{ width: '100%' }}>
          <Group>
            <UnstyledButton onClick={handleNavigateToUser}>
              <Avatar src={avatar} alt={author} radius="xl" />
            </UnstyledButton>
            <div>
              <Text size="sm">{author}</Text>
              <Text size="xs" c="dimmed">{formatDistanceToNow(new Date(createdAt))} ago</Text>
            </div>
          </Group>

          <Text pl={54} pt="sm" size="sm" className="post-content" dangerouslySetInnerHTML={{ __html: text }} />
         

          {mediaAttachments.length > 0 && (
           <div style={{ paddingLeft: '54px', paddingRight: '54px', paddingTop: '1rem' }}>
            {mediaAttachments.map((url, index) => (
              <img key={index} src={url} alt={`Attachment ${index + 1}`} style={{ width: '100%', marginBottom: '10px' }} />
            ))}
          </div>
        )}

      {previewCards.map((card, index) => (
          <div key={index} style={{
            display: 'flex',
            alignItems: 'flex-start',
            padding: '1rem',
            border: '1px solid rgba(0, 0, 0, 0.1)',
            borderRadius: '8px',
            overflow: 'hidden',
            boxShadow: '0 3px 3px rgba(0, 0, 0, 0.1)',
            marginTop: '1rem',
          }} onClick={(e) => { e.stopPropagation(); window.open(card.url, '_blank'); }}>
            {card.image && (
              <img src={card.image} alt={card.title} style={{ width: '150px', margin: '10px' }} />
            )}
            <div>
              <Text size="sm">{card.title}</Text>
              <Text size="xs" c="dimmed">{card.description}</Text>
            </div>
          </div>
        ))}

          <Text pl={54} pt="sm" size="sm">Post Id: {id}</Text>
          <Text pl={54} pt="sm" size="sm">Stack Id: {stackId}</Text>
        </UnstyledButton>
        <Divider my="md" />
        <Group style={{ display: 'flex', justifyContent: 'space-between', padding: '0 20px', marginBottom: '-20px' }}>
          <Button variant="subtle" size="sm" radius="lg" onClick={handleReply} style={{ display: 'flex', alignItems: 'center' }}>
            <IconMessageCircle size={20} /> <Text ml={4}>{replyCount}</Text>
          </Button>
          <Button variant="subtle" size="sm" radius="lg" onClick={handleLike} style={{ display: 'flex', alignItems: 'center' }}>
            {liked ? <IconHeartFilled size={20} /> : <IconHeart size={20} />} <Text ml={4}>{likeCount}</Text>
          </Button>
          <Button variant="subtle" size="sm" radius="lg" onClick={handleSave} style={{ display: 'flex', alignItems: 'center' }}>
            {bookmarkedState ? <IconBookmarkFilled size={20} /> : <IconBookmark size={20} />}
          </Button>
          <Button variant="subtle" size="sm" radius="lg" onClick={handleAnnotation} style={{ display: 'flex', alignItems: 'center' }}>
            <IconNote size={20} />
          </Button>
        </Group>

        <UnstyledButton onClick={handleStackCountClick}>
           <StackCount
            count={stackCount}
            onClick={handleStackCountClick}
            onStackClick={handleStackClick}
            relatedStacks={relatedStacks}
            expanded={isExpanded}
          />
        </UnstyledButton>

      </Paper>
      {stackId !== null && [...Array(4)].map((_, index) => (
        <div
          key={index}
          style={{
            position: 'absolute',
            bottom: `${20 - 5 * (index + 1)}px`,
            left: `${20 - 5 * (index + 1)}px`,
            width: "100%",
            height: `${cardHeight}px`,
            backgroundColor: '#fff',
            zIndex: index + 1,
            boxShadow: '0 3px 10px rgba(0,0,0,0.1)',
            borderRadius: '8px',
            border: '1px solid rgba(0, 0, 0, 0.1)',
          }}
        />
      ))}
      <AnnotationModal
        isOpen={annotationModalOpen}
        onClose={() => setAnnotationModalOpen(false)}
        stackId={stackId}
      />
    </div>
  );
}
