"use client";
import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Text, Avatar, Group, Paper, UnstyledButton, Button, Divider } from '@mantine/core';
import { IconHeart, IconBookmark, IconNote, IconMessageCircle, IconHeartFilled, IconBookmarkFilled } from '@tabler/icons-react';
import { formatDistanceToNow } from 'date-fns';
import StackCount from '../StackCount';
import axios from 'axios';
import AnnotationModal from '../AnnotationModal';
import StackPostsModal from '../StackPostsModal';
import Link from 'next/link';

const MastodonInstanceUrl = 'https://beta.stacky.social';
// const MastodonInstanceUrl = 'https://mastodon.social';

interface PostProps {
  id: string;
  text: string;
  author: string;
  avatar: string;
  repliesCount: number;
  createdAt: string;
  stackCount: number | null;
  stackId: string | null;
  favouritesCount: number;
  favourited: boolean;
  bookmarked: boolean;
  mediaAttachments: string[];
}

interface StackPost {
  stackId: string;
  apiUrl: string;
}

export default function Post({ id, text, author, avatar, repliesCount, createdAt, stackCount, stackId, favouritesCount, favourited, bookmarked }: PostProps) {
  const router = useRouter();
  const [cardHeight, setCardHeight] = useState(0);
  const paperRef = useRef<HTMLDivElement>(null);

  const [liked, setLiked] = useState(favourited);
  const [bookmarkedState, setBookmarkedState] = useState(bookmarked);
  const [likeCount, setLikeCount] = useState(favouritesCount);
  const [replyCount, setReplyCount] = useState(repliesCount);
  const [annotationModalOpen, setAnnotationModalOpen] = useState(false);
  const [stackPostsModalOpen, setStackPostsModalOpen] = useState(false);
  const [mediaAttachments, setMediaAttachments] = useState<string[]>([]);

  useEffect(() => {
    if (paperRef.current) {
      setCardHeight(paperRef.current.clientHeight);
    }
  }, [text]);

  useEffect(() => {
    fetchPostData();
  }, []);

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
    } catch (error) {
      console.error('Error fetching post data:', error);
    }
  };

  const handleNavigateToUser = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `/user/${author}`;
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
      await fetchPostData(); // Fetch the updated count from the API
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

  const handleAnnotationSubmit = (annotation: string) => {
    console.log("Annotation submitted:", annotation);
    setAnnotationModalOpen(false);
  };

  const handleStackCountClick = async () => {
    const accessToken = getAccessToken();
    if (!accessToken) return;

    if (!stackId) {
        console.log('Stack ID is null');
        return;
    }

    
        setStackPostsModalOpen(true);
   
};



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
        }}
        withBorder
      >
        <UnstyledButton onClick={handleNavigate} style={{ width: '100%' }}>
          <Group>
            <UnstyledButton onClick={handleNavigateToUser}>
              <Avatar
                src={avatar}
                alt={author}
                radius="xl"
              />
            </UnstyledButton>
            <div>
              <Text size="sm">{author}</Text>
              <Text size="xs" color="dimmed">{formatDistanceToNow(new Date(createdAt))} ago</Text>
            </div>
          </Group>
          
          <Text pl={54} pt="sm" size="sm" dangerouslySetInnerHTML={{ __html: text }} />
          {mediaAttachments.length > 0 && (
           <div style={{ paddingLeft: '54px', paddingRight: '54px', paddingTop: '1rem' }}> 
            {mediaAttachments.map((url, index) => (
              <img key={index} src={url} alt={`Attachment ${index + 1}`} style={{ width: '100%', marginBottom: '10px' }} />
            ))}
          </div>
        )}
          <Text pl={54} pt="sm" size="sm">Post Id: {id}</Text>
          <Text pl={54} pt="sm" size="sm">Stack Id: {stackId}</Text>
        </UnstyledButton>
        <Divider my="md" />
        <Group style={{ display: 'flex', justifyContent: 'space-between', padding: '0 20px' }}>
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
        {stackId !== null && (
        <UnstyledButton onClick={handleStackCountClick}>
        <StackCount count={stackCount !== null ? stackCount : 0} onClick={handleStackCountClick} />
        </UnstyledButton>
        )}
      </Paper>
      {stackId!== null && [...Array(4)].map((_, index) => (
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

      <StackPostsModal
        isOpen={stackPostsModalOpen}
        onClose={() => setStackPostsModalOpen(false)}
        apiUrl={`${MastodonInstanceUrl}:3002/stacks/${stackId}/posts`}
        stackId={stackId}
      />
    </div>
  );
}
