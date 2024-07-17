"use client";
import React, { useState, useEffect } from 'react';
import { Container, Paper, Group, Avatar, Text, LoadingOverlay, Divider, Button } from '@mantine/core';
import { IconHeart, IconBookmark, IconMessageCircle, IconShare, IconHeartFilled, IconBookmarkFilled, IconGripVertical } from '@tabler/icons-react';
import { rem } from '@mantine/core';
import axios from 'axios';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

const MastodonInstanceUrl = "https://beta.stacky.social";

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
        username: string;
    };
}

const PostCard = ({ post, isFocusPost }: { post: PostType, isFocusPost?: boolean }) => (
    <Paper withBorder radius="md" mt={20} p="lg" style={{ position: 'relative', zIndex: 5, backgroundColor: isFocusPost ? '#C5F6FA' : 'inherit' }}>
        <Group>
            <Avatar src={post.account.avatar} alt={post.account.username} radius="xl" />
            <div>
                <Text size="sm">{post.account.username}</Text>
                <Text size="xs">{new Date(post.created_at).toLocaleString()}</Text>
            </div>
        </Group>
        <Text pl={54} pt="sm" size="sm" dangerouslySetInnerHTML={{ __html: post.content }} />
        <Divider my="md" />
        <Group>
            <Button variant="subtle" size="sm" radius="lg">
                <IconMessageCircle size={20} /> <Text ml={4}>{post.replies_count}</Text>
            </Button>
            <Button variant="subtle" size="sm" radius="lg" style={{ display: 'flex', alignItems: 'center' }}>
                {post.favourited ? <IconHeartFilled size={20} /> : <IconHeart size={20} />} <Text ml={4}>{post.favourites_count}</Text>
            </Button>
            <Button variant="subtle" size="sm" radius="lg" style={{ display: 'flex', alignItems: 'center' }}>
                {post.bookmarked ? <IconBookmarkFilled size={20} /> : <IconBookmark size={20} />}
            </Button>
            <Button variant="subtle" size="sm" radius="lg">
                <IconShare size={20} />
            </Button>
        </Group>
    </Paper>
);

const RightColumn = () => {
    const [posts, setPosts] = useState<PostType[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchPosts();
    }, []);

    const fetchPosts = async () => {
        try {
            const response = await axios.get(`${MastodonInstanceUrl}/api/v1/timelines/public`);
            setPosts(response.data);
        } catch (error) {
            console.error('Failed to fetch posts:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ width: '50%', paddingLeft: rem(10) }}>
            {loading && <LoadingOverlay visible={loading} />}
            <DragDropContext onDragEnd={({ destination, source }) => {
                if (destination) {
                    const reorderedPosts = Array.from(posts);
                    const [removed] = reorderedPosts.splice(source.index, 1);
                    reorderedPosts.splice(destination.index, 0, removed);
                    setPosts(reorderedPosts);
                }
            }}>
                <Droppable droppableId="post-list" direction="vertical">
                    {(provided) => (
                        <div {...provided.droppableProps} ref={provided.innerRef}>
                            {posts.map((post, index) => (
                                <Draggable key={post.id} draggableId={post.id} index={index}>
                                    {(provided, snapshot) => (
                                        <div
                                            ref={provided.innerRef}
                                            {...provided.draggableProps}
                                            style={{
                                                ...provided.draggableProps.style,
                                                display: 'flex',
                                                alignItems: 'center',
                                                borderRadius: 'var(--mantine-radius-md)',
                                                border: `${rem(1)} solid`,
                                                padding: `${rem(10)} ${rem(20)}`,
                                                paddingLeft: `calc(${rem(20)} - ${rem(10)})`,
                                                backgroundColor: snapshot.isDragging ? 'lightgrey' : 'white',
                                                marginBottom: `${rem(10)}`
                                            }}
                                        >
                                            <div {...provided.dragHandleProps} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', paddingRight: rem(10) }}>
                                                <IconGripVertical style={{ width: rem(18), height: rem(18) }} stroke={1.5} />
                                            </div>
                                            <PostCard post={post} />
                                        </div>
                                    )}
                                </Draggable>
                            ))}
                            {provided.placeholder}
                        </div>
                    )}
                </Droppable>
            </DragDropContext>
        </div>
    );
};

export default function Annotation() {
    const postId1 = "112794108401877536"; // 你的post ID
    const [post, setPost] = useState<PostType | null>(null);
    const [replies, setReplies] = useState<PostType[]>([]);
    const [ancestors, setAncestors] = useState<PostType[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchPostAndReplies(postId1);
    }, [postId1]);

    const fetchPostAndReplies = async (postId: string) => {
        const accessToken = localStorage.getItem('accessToken');
        if (!accessToken) {
            console.error('Access token is missing.');
            setLoading(false);
            return;
        }

        try {
            const postResponse = await axios.get(`${MastodonInstanceUrl}/api/v1/statuses/${postId}`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            setPost(postResponse.data);

            const repliesResponse = await axios.get(`${MastodonInstanceUrl}/api/v1/statuses/${postId}/context`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            setReplies(repliesResponse.data.descendants);
            setAncestors(repliesResponse.data.ancestors);

        } catch (error) {
            console.error('Failed to fetch post or replies:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Container>
            <div style={{ marginBottom: rem(20) }}>
                <Button style={{ marginRight: rem(20) }}>button1</Button>
                <Button>button 2</Button>
            </div>
            <div style={{ display: 'flex' }}>
                <div style={{ width: '50%', paddingRight: rem(10) }}>
                    {loading && <LoadingOverlay visible={loading} />}
                    {ancestors.map(ancestor => (
                        <PostCard key={ancestor.id} post={ancestor} />
                    ))}
                    {post && <PostCard post={post} isFocusPost={true} />}
                    {replies.map(reply => (
                        <PostCard key={reply.id} post={reply} />
                    ))}
                </div>
                <RightColumn />
            </div>
        </Container>
    );
}
