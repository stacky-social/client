import React, { useEffect, useState } from 'react';
import { SimpleGrid, Card, Image, Text, Container, AspectRatio, Group, Avatar, Button, Divider, Paper, UnstyledButton } from '@mantine/core';
import axios from 'axios';
import classes from './expandModal.module.css';
import { IconBookmark, IconHeart, IconMessageCircle, IconShare, IconHeartFilled, IconBookmarkFilled, IconSearch } from "@tabler/icons-react";
import { formatDistanceToNow } from 'date-fns';
import { rem } from '@mantine/core';
import { TextInput } from '@mantine/core';
import { Code } from '@mantine/core';


interface ExpandModalProps {
    stackId: string;
}

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
    };
}

interface Substack {
    substackId: string;
    size: number;
    topPost: PostType;
}

export default function ExpandModal({ stackId }: ExpandModalProps) {
    const [substacks, setSubstacks] = useState<Substack[]>([]);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const fetchSubstacks = async () => {
            try {
                let response;
                if (process.env.NODE_ENV === 'development') {
                    response = await axios.get('/mockSubstacks.json');
                } else {
                    response = await axios.get(`/api/stacks/${stackId}/substacks`);
                }
                setSubstacks(response.data);
            } catch (error) {
                console.error('Failed to fetch substacks:', error);
            }
        };

        fetchSubstacks();
    }, [stackId]);

    const handleStackClick = (stackId: string) => {
        console.log(`Stack ${stackId} clicked`);
    };
    const handleSearch = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
            console.log(`Search term: ${searchTerm}`);
           
        }
    };

    const cards = substacks.map((stack) => (
        <div key={stack.substackId} style={{ margin: '20px' }}>
            <Paper
                style={{
                    backgroundColor: '#fff',
                    boxShadow: '0 3px 10px rgba(0,0,0,0.1)',
                    borderRadius: '8px',
                }}
                withBorder
            >
                <UnstyledButton onClick={() => handleStackClick(stack.substackId)} style={{ width: '100%' }}>
                    <Group>
                        <Avatar
                            src={stack.topPost.account.avatar}
                            alt={stack.topPost.account.display_name}
                            radius="xl"
                        />
                        <div>
                            <Text size="sm">{stack.topPost.account.display_name}</Text>
                            <Text size="xs" color="dimmed">{formatDistanceToNow(new Date(stack.topPost.created_at))} ago</Text>
                        </div>
                    </Group>
                    <div style={{ paddingLeft: '54px', paddingTop: '1rem', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: '3', WebkitBoxOrient: 'vertical' }}>
                        <div dangerouslySetInnerHTML={{ __html: stack.topPost.content }} />
                    </div>
                    <Text pl={54} pt="sm" size="sm">Post Id: {stack.topPost.id}</Text>
                    <Text pl={54} pt="sm" size="sm">Stack Id: {stack.substackId}</Text>
                    <Text pl={54} pt="sm" size="sm">Stack rel: {stack.size}</Text>
                </UnstyledButton>
                <Divider my="md" />
                <Group style={{ display: 'flex', justifyContent: 'space-between', padding: '0 20px' }}>
                    <Button variant="subtle" size="sm" radius="lg">
                        <IconMessageCircle size={20} /> <Text ml={4}>{stack.topPost.replies_count}</Text>
                    </Button>
                    <Button variant="subtle" size="sm" radius="lg">
                        {stack.topPost.favourited ? <IconHeartFilled size={20} /> : <IconHeart size={20} />} <Text ml={4}>{stack.topPost.favourites_count}</Text>
                    </Button>
                    <Button variant="subtle" size="sm" radius="lg">
                        {stack.topPost.bookmarked ? <IconBookmarkFilled size={20} /> : <IconBookmark size={20} />}
                    </Button>
                    <Button variant="subtle" size="sm" radius="lg">
                        <IconShare size={20} />
                    </Button>
                </Group>
            </Paper>
        </div>
    ));

    return (
        <Container py="xl" style={{ maxWidth: '1000px', margin: '0 auto' }}> 
        <TextInput
                placeholder="Search"
                size="xs"
                leftSection={<IconSearch style={{ width: rem(12), height: rem(12) }} stroke={1.5} />}
                rightSectionWidth={70}
                rightSection={<Code className={classes.searchCode}>Enter</Code>}
                styles={{ section: { pointerEvents: 'none' } }}
                mb="sm"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.currentTarget.value)}
                onKeyDown={handleSearch}
            />
            
            <SimpleGrid cols={2} spacing="lg">{cards}</SimpleGrid>
        </Container>
    );
}
