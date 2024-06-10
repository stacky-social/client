import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Text, Avatar, Group, Paper, UnstyledButton, Button, Divider } from '@mantine/core';
import { IconHeart, IconBookmark, IconShare, IconMessageCircle } from '@tabler/icons-react';
import { formatDistanceToNow } from 'date-fns';
import StackCount from './StackCount';

interface PostProps {
    id: string;
    text: string;
    author: string;
    avatar: string;
    repliesCount: number;
    createdAt: string;
    stackCount: number | null;
    stackId: string | null;
}

export default function Post({ id, text, author, avatar, repliesCount, createdAt, stackCount, stackId }: PostProps) {
    const router = useRouter();
    const [cardHeight, setCardHeight] = useState(0);
    const paperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (paperRef.current) {
            setCardHeight(paperRef.current.clientHeight);
        }
    }, [text]);

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
                </UnstyledButton>
                <Divider my="md" />
                <Group style={{ display: 'flex', justifyContent: 'space-between', padding: '0 20px' }}>
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
                {stackCount !== null && <StackCount count={stackCount} />}
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
        </div>
    );
}
