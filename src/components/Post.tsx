import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Text, Avatar, Group, Paper, UnstyledButton, Button, Divider } from '@mantine/core';
import { IconHeart, IconBookmark, IconShare, IconMessageCircle } from '@tabler/icons-react';
import { formatDistanceToNow } from 'date-fns';

interface PostProps {
    id: string;
    text: string;
    author: string;
    avatar: string;
    repliesCount: number;
    createdAt: string;
}

export default function Post({ id, text, author, avatar, repliesCount, createdAt }: PostProps) {
    const router = useRouter();
    const [showFullText, setShowFullText] = useState(false);

    const handleNavigate = () => {
        router.push(`/posts/${id}`);
    };

    const handleReply = () => {
        router.push(`/posts/${id}`);
    };

    const handleLike = () => {
        console.log("Like post:", id);
    };

    const handleSave = () => {
        console.log("Save post:", id);
    };

    const handleShare = () => {
        console.log("Share post:", id);
    };

    return (
        <div style={{ position: 'relative', margin: '20px', marginBottom: '2rem', height: '220px' }}>
            {[...Array(4)].map((_, index) => (
                <Paper
                    key={index}
                    style={{
                        position: 'absolute',
                        top: `${10 * (index + 1)}px`,
                        left: `${10 * (index + 1)}px`,
                        width: '600px',
                        height: '200px',
                        zIndex: index + 1,
                        boxShadow: '0 3px 10px rgba(0,0,0,0.1)',
                    }}
                    withBorder
                />
            ))}
            <Paper
                style={{
                    position: 'absolute',
                    top: `${10 * 5}px`,
                    left: `${10 * 5}px`,
                    width: '600px',
                    height: '200px',
                    backgroundColor: '#fff',
                    zIndex: 5,
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
                    <div style={{ paddingLeft: '54px', paddingTop: '1rem', overflow: 'hidden', textOverflow: 'ellipsis', display: showFullText ? 'block' : '-webkit-box', WebkitLineClamp: showFullText ? 'none' : '3', WebkitBoxOrient: 'vertical' }}>
                        <div dangerouslySetInnerHTML={{ __html: text }} />
                    </div>
                    <Text pl={54} pt="sm" size="sm">Post Id: {id}</Text>
                </UnstyledButton>
                <Divider my="md" />
                <Group style={{ display: 'flex', justifyContent: 'space-around', padding: '0 20px' }}>
                    <Button variant="subtle" size="sm" radius="lg" onClick={handleReply} style={{ display: 'flex', alignItems: 'center' }}>
                        <IconMessageCircle size={20} /> <Text ml={4}>{repliesCount}</Text>
                    </Button>
                    <Button variant="subtle" size="sm" radius="lg" onClick={handleLike} style={{ display: 'flex', alignItems: 'center' }}>
                        <IconHeart size={20} />
                    </Button>
                    <Button variant="subtle" size="sm" radius="lg" onClick={handleSave} style={{ display: 'flex', alignItems: 'center' }}>
                        <IconBookmark size={20} />
                    </Button>
                    <Button variant="subtle" size="sm" radius="lg" onClick={handleShare} style={{ display: 'flex', alignItems: 'center' }}>
                        <IconShare size={20} />
                    </Button>
                </Group>
            </Paper>
        </div>
    );
}
