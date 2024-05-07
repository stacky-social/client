"use client"

import { useRouter } from 'next/navigation';
import {Text, Avatar, Group, Paper, UnstyledButton, Button, ActionIcon, Stack, Divider} from '@mantine/core';
import { IconHeart, IconBookmark, IconShare, IconMessageCircle } from '@tabler/icons-react';

interface PostProps {
    id: string;
    text: string;
    author: string;
    avatar: string;
    repliesCount: number;
}

export default function Post({ id, text, author, avatar, repliesCount }: PostProps) {
    const router = useRouter();

    const handleNavigate = () => {
        router.push(`/posts/${id}`);
    };

    const handleReply = () => {
        router.push(`/posts/${id}`);
    };

    const handleLike = () => {
        console.log("Like post:", id);
        // Add like handling logic here
    };

    const handleSave = () => {
        console.log("Save post:", id);
        // Add save handling logic here
    };

    const handleShare = () => {
        console.log("Share post:", id);
        // Add share handling logic here
    };

    return (
        <div>
            <Paper withBorder radius="md" mt={20} shadow="lg" p="lg">
                <UnstyledButton onClick={handleNavigate} style={{ width: '100%' }}>
                    <Group>
                        <Avatar
                            src={avatar}
                            alt={author}
                            radius="xl"
                        />
                        <div>
                            <Text size="sm">{author}</Text>
                            <Text size="xs" color="dimmed">10 minutes ago</Text>
                        </div>
                    </Group>
                    <Text pl={54} pt="sm" size="sm">{text}</Text>
                    <Text pl={54} pt="sm" size="sm">Post Id: {id}</Text>
                </UnstyledButton>

                <Divider my="md" />
                <Group justify="space-between" mx="20">
                    <Button variant="subtle" size="sm" radius="lg" onClick={handleReply}>
                        <IconMessageCircle size={20} /> <Text>{repliesCount}</Text>
                    </Button>
                    <Button variant="subtle" size="sm" radius="lg" onClick={handleLike}>
                        <IconHeart size={20} />
                    </Button>
                    <Button variant="subtle" size="sm" radius="lg" onClick={handleSave}>
                        <IconBookmark size={20} />
                    </Button>
                    <Button variant="subtle" size="sm" radius="lg" onClick={handleShare}>
                        <IconShare size={20} />
                    </Button>
                </Group>
            </Paper>
        </div>
    );
}
