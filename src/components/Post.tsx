import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Text, Avatar, Group, Paper, UnstyledButton, Button, Divider } from '@mantine/core';
import { IconHeart, IconBookmark, IconNote, IconMessageCircle, IconHeartFilled, IconBookmarkFilled } from '@tabler/icons-react';
import { formatDistanceToNow } from 'date-fns';
import StackCount from './StackCount';
import axios from 'axios';
import AnnotationModal from './AnnotationModal';
import StackPostsModal, { PostType } from './StackPostsModal';

const MastodonInstanceUrl = 'https://beta.stacky.social';

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
}

interface StackPost {
  stackId: string;
  posts: PostType[];
}

const fakeStackPosts: StackPost = {
  stackId: "123456",
  posts: [
    {
      postId: "1",
      text: "This is the first post in the stack.",
      author: "Author1",
      avatar: "/path/to/avatar1.png",
      replies: [],
      createdAt: "2024-06-01T12:00:00Z",
      favouritesCount: 10,
      favourited: false,
      bookmarked: false
    },
    {
      postId: "2",
      text: "This is the second post in the stack.",
      author: "Author2",
      avatar: "/path/to/avatar2.png",
      replies: [],
      createdAt: "2024-06-02T13:00:00Z",
      favouritesCount: 20,
      favourited: true,
      bookmarked: true
    },
    {
      postId: "3",
      text: "This is the third post in the stack.",
      author: "Author3",
      avatar: "/path/to/avatar3.png",
      replies: [],
      createdAt: "2024-06-03T14:00:00Z",
      favouritesCount: 30,
      favourited: false,
      bookmarked: false
    },
    {
      postId: "4",
      text: "This is the fourth post in the stack.",
      author: "Author4",
      avatar: "/path/to/avatar4.png",
      replies: [],
      createdAt: "2024-06-04T15:00:00Z",
      favouritesCount: 40,
      favourited: true,
      bookmarked: true
    }
  ]
};

export default function Post({ id, text, author, avatar, repliesCount, createdAt, stackCount, stackId, favouritesCount, favourited, bookmarked }: PostProps) {
  const router = useRouter();
  const [cardHeight, setCardHeight] = useState(0);
  const paperRef = useRef<HTMLDivElement>(null);

  const [liked, setLiked] = useState(favourited);
  const [bookmarkedState, setBookmarkedState] = useState(bookmarked);
  const [likeCount, setLikeCount] = useState(favouritesCount);
  const [annotationModalOpen, setAnnotationModalOpen] = useState(false);
  const [stackPostsModalOpen, setStackPostsModalOpen] = useState(false);
  const [stackPosts, setStackPosts] = useState<PostType[]>(fakeStackPosts.posts);

  useEffect(() => {
    if (paperRef.current) {
      setCardHeight(paperRef.current.clientHeight);
    }
  }, [text]);

  useEffect(() => {
    fetchPostData();
  }, []);

  const handleNavigate = () => {
    router.push(`/posts/${id}`);
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
      setLikeCount(data.favourites_count);
      setLiked(data.favourited);
      setBookmarkedState(data.bookmarked);
    } catch (error) {
      console.error('Error fetching post data:', error);
    }
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
  
    try {
      const response = await axios.get(`${MastodonInstanceUrl}/stacks/${stackId}/fposts`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
  
      const data = response.data;
      setStackPosts(data.posts);
      setStackPostsModalOpen(true);
    } catch (error) {
      console.error('Error fetching stack posts:', error);
    }
  };

  const cardWidth = '600px';

  return (
    <div style={{ position: 'relative', margin: '20px', marginBottom: '2rem', width: cardWidth }}>
      <Paper
        ref={paperRef}
        style={{
          position: 'relative',
          width: cardWidth,
          backgroundColor: '#fff',
          zIndex: 5,
          boxShadow: '0 3px 10px rgba(0,0,0,0.1)',
          borderRadius: '8px',
        }}
        withBorder
      >
        <UnstyledButton onClick={handleNavigate} style={{ width: '100%' }}>
          <Group>
            <Avatar
              src={avatar}
              alt={author}
              radius="xl"
            />
            <div>
              <Text size="sm">{author}</Text>
              <Text size="xs" color="dimmed">{formatDistanceToNow(new Date(createdAt))} ago</Text>
            </div>
          </Group>
          <div style={{ paddingLeft: '54px', paddingTop: '1rem', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: '3', WebkitBoxOrient: 'vertical' }}>
            <div dangerouslySetInnerHTML={{ __html: text }} />
          </div>
          <Text pl={54} pt="sm" size="sm">Post Id: {id}</Text>
          <Text pl={54} pt="sm" size="sm">Stack Id: {stackId}</Text>
        </UnstyledButton>
        <Divider my="md" />
        <Group style={{ display: 'flex', justifyContent: 'space-between', padding: '0 20px' }}>
          <Button variant="subtle" size="sm" radius="lg" onClick={handleReply} style={{ display: 'flex', alignItems: 'center' }}>
            <IconMessageCircle size={20} /> <Text ml={4}>{repliesCount}</Text>
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
          <StackCount count={stackCount !== null ? stackCount : 0} onClick={handleStackCountClick} />
        </UnstyledButton>
      </Paper>
      {[...Array(4)].map((_, index) => (
        <div
          key={index}
          style={{
            position: 'absolute',
            bottom: `${20 - 5 * (index + 1)}px`,
            left: `${20 - 5 * (index + 1)}px`,
            width: cardWidth,
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
        onSubmit={handleAnnotationSubmit}
      />
      <StackPostsModal
        isOpen={stackPostsModalOpen}
        onClose={() => setStackPostsModalOpen(false)}
        posts={stackPosts}
      />
    </div>
  );
}
