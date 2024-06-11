"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from "../../../components/Shell";
import {
    Avatar,
    Group,
    LoadingOverlay,
    Paper,
    Text,
    Divider,
    Button,
    Image,
    TextInput,
    Card,
    Modal
} from "@mantine/core";
import { IconBookmark, IconHeart, IconMessageCircle, IconShare, IconSearch, IconHeartFilled, IconBookmarkFilled } from "@tabler/icons-react";
import axios from 'axios';
import classes from './postId.module.css';
import ExpandModal from "../../../components/ExpandModal";
import { PostType } from '../../../types/PostType';
import RelatedStacks from '../../../components/RelatedStacks';
import { generateFakeRelatedStacks } from '../../FakeData/generateFakeRelatedStacks'; 

const MastodonInstanceUrl = 'https://mastodon.social'; // Mastodon instance URL

interface RelatedStack {
    rel: string;
    stackId: string;
    size: number;
    topPost: PostType;
}


export default function PostView({ params }: { params: { id: string } }) {
    const router = useRouter();
    const { id } = params;
    const [loading, setLoading] = useState(true);
    const [post, setPost] = useState<any | null>(null);
    const [replies, setReplies] = useState<any[]>([]);
    const [randomTexts, setRandomTexts] = useState<string[]>([]);
    const [modalOpened, setModalOpened] = useState(false);
    const [modalContent, setModalContent] = useState<string>('');
    const [replyContent, setReplyContent] = useState<string>('');
    const [currentUser, setCurrentUser] = useState<any | null>(null);
    const [liked, setLiked] = useState(false);
    const [bookmarked, setBookmarked] = useState(false);
    const [likeCount, setLikeCount] = useState(0);
    // const [relatedStacks, setRelatedStacks] = useState<RelatedStack[]>([]);
    const [relatedStacks, setRelatedStacks] = useState<RelatedStack[]>(generateFakeRelatedStacks(5));

    const initialRandomTexts = [
        "Exploring the depths of space!",
        "Discovering new programming paradigms.",
        "The future of artificial intelligence.",
        "Advancements in quantum computing.",
        "The rise of renewable energy."
    ];

    useEffect(() => {
        fetchPostAndReplies(id);
    }, [id]);

    useEffect(() => {
        fetchCurrentUser();
        generateRandomTexts();
    }, []);

    useEffect(() => {
        if (post) {
            fetchStackAndRelatedStacks(id);
        }
    }, [post]);


    const fetchCurrentUser = async () => {
        const accessToken = localStorage.getItem('accessToken');
        if (!accessToken) {
            console.error('Access token is missing.');
            return;
        }

        try {
            const userResponse = await axios.get(`${MastodonInstanceUrl}/api/v1/accounts/verify_credentials`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            setCurrentUser(userResponse.data);
        } catch (error) {
            console.error('Failed to fetch current user:', error);
        }
    };

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
            setLiked(postResponse.data.favourited);
            setBookmarked(postResponse.data.bookmarked);
            setLikeCount(postResponse.data.favourites_count);

            const repliesResponse = await axios.get(`${MastodonInstanceUrl}/api/v1/statuses/${postId}/context`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            setReplies(repliesResponse.data.descendants);
        } catch (error) {
            console.error('Failed to fetch post or replies:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchStackAndRelatedStacks = async (postId: string) => {
        const accessToken = localStorage.getItem('accessToken');
        if (!accessToken) {
            console.error('Access token is missing.');
            return;
        }

        try {
            // Fetch Stack ID for the given Post ID
            const stackResponse = await axios.get(`http://beta.stacky.social:3002/posts/${postId}/stack`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            const { stackId } = stackResponse.data;

            if (!stackId) {
                console.error('No stack ID found for the given post.');
                return;
            }

            // Fetch related Stacks for the given Stack ID
            const relatedStacksResponse = await axios.get(`http://beta.stacky.social:3002/stacks/${stackId}/related`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            const relatedStacksData = relatedStacksResponse.data.relatedStacks.map((stack: any) => ({
                rel: stack.rel,
                stackId: stack.stackId,
                stackSize: stack.stackSize, 
                topPost: {
                    postId: stack.topPost.id,
                    text: stack.topPost.content,
                    author: stack.topPost.account.username,
                    avatar: stack.topPost.account.avatar,
                    replies: [],
                    createdAt: stack.topPost.created_at,
                    favouritesCount: stack.topPost.favourites_count,
                    favourited: stack.topPost.favourited,
                    bookmarked: stack.topPost.bookmarked,
                    stackSize: stack.stackSize, 
                    stackId: stackId
                }
            }));

            setRelatedStacks(relatedStacksData);
        } catch (error) {
            console.error('Failed to fetch stack or related stacks:', error);
        }
    };


    const generateRandomTexts = () => {
        const shuffledTexts = initialRandomTexts.sort(() => 0.5 - Math.random()).slice(0, 4);
        setRandomTexts(shuffledTexts);
    };

    const handleReplySubmit = async () => {
        const accessToken = localStorage.getItem('accessToken');
        if (!accessToken) {
            console.error('Access token is missing.');
            return;
        }

        try {
            await axios.post(`${MastodonInstanceUrl}/api/v1/statuses`, {
                status: replyContent,
                in_reply_to_id: id
            }, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            setReplyContent('');
            fetchPostAndReplies(id); // Refresh replies after posting
        } catch (error) {
            console.error('Failed to post reply:', error);
        }
    };

    const handleNavigate = (replyId: string) => {
        router.push(`/posts/${replyId}`);
    };

    const handleLike = async () => {
        const accessToken = localStorage.getItem('accessToken');
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
            await fetchPostAndReplies(id); // Fetch the updated count from the API
        } catch (error) {
            console.error('Error liking post:', error);
        }
    };

    const handleSave = async () => {
        const accessToken = localStorage.getItem('accessToken');
        if (!accessToken) return;

        try {
            if (bookmarked) {
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
            await fetchPostAndReplies(id); // Fetch the updated count from the API
        } catch (error) {
            console.error('Error bookmarking post:', error);
        }
    };

    const handleShare = () => {
        console.log("Share post:", id);
    };

    const explorePages = () => {
        generateRandomTexts();
    };

    const handleCardClick = (text: string) => {
        setModalContent(text);
        setModalOpened(true);
    };

    const stacks = () => {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', margin: '2rem' }}>
                {randomTexts.map((text, index) => (
                    <Card withBorder radius="md" p={0} className={classes.card} key={index} style={{ margin: '1rem' }} onClick={() => handleCardClick(text)}>
                        <Group wrap="nowrap" gap={0}>
                            <Image
                                src="https://images.unsplash.com/photo-1602080858428-57174f9431cf?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&q=80"
                                height={160}
                            />
                            <div className={classes.body}>
                                <Text tt="uppercase" c="dimmed" fw={700} size="xs">
                                    technology
                                </Text>
                                <Text className={classes.title} mt="xs" mb="md">
                                    {text}
                                </Text>
                                <Group wrap="nowrap" gap="xs">
                                    <Group gap="xs" wrap="nowrap">
                                        <Avatar
                                            size={20}
                                            src="https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-8.png"
                                        />
                                        <Text size="xs">Elsa Typechecker</Text>
                                    </Group>
                                    <Text size="xs" c="dimmed">
                                        •
                                    </Text>
                                    <Text size="xs" c="dimmed">
                                        Feb 6th
                                    </Text>
                                </Group>
                            </div>
                        </Group>
                    </Card>
                ))}
            </div>
        );
    };

    if (!post && !loading) {
        return (
            <Shell>
                <Paper withBorder radius="md" mt={20} p="lg">
                    <Text size="sm">Post not found.</Text>
                </Paper>
            </Shell>
        );
    }

    return (
        <Shell>
            <Modal
                opened={modalOpened}
                onClose={() => setModalOpened(false)}
                title="Expand Content"
                centered
                size="auto"
            >
                <ExpandModal />
            </Modal>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', width: '100%' }}>
                <div style={{ gridColumn: '1 / 2' }}>
                    <Paper withBorder radius="md" mt={20} p="lg" style={{ position: 'relative' }} shadow="lg">
                        <LoadingOverlay visible={loading} zIndex={1000} overlayProps={{ radius: "sm", blur: 2 }} />
                        <Group>
                            <Avatar src={post?.account.avatar} alt={post?.account.username} radius="xl" />
                            <div>
                                <Text size="sm">{post?.account.username}</Text>
                                <Text size="xs">{new Date(post?.created_at).toLocaleString()}</Text>
                            </div>
                        </Group>
                        <Text pl={54} pt="sm" size="sm" dangerouslySetInnerHTML={{ __html: post?.content }} />
                        <Text pl={54} pt="sm" size="sm">Post Id: {post?.id}</Text>
                        <Divider my="md" />
                        <Group justify="space-between" mx="20">
                            <Button variant="subtle" size="sm" radius="lg" onClick={() => handleNavigate(id)}>
                                <IconMessageCircle size={20} /> <Text ml={4}>{post?.replies_count}</Text>
                            </Button>
                            <Button variant="subtle" size="sm" radius="lg" onClick={handleLike} style={{ display: 'flex', alignItems: 'center' }}>
                                {liked ? <IconHeartFilled size={20} /> : <IconHeart size={20} />} <Text ml={4}>{likeCount}</Text>
                            </Button>
                            <Button variant="subtle" size="sm" radius="lg" onClick={handleSave} style={{ display: 'flex', alignItems: 'center' }}>
                                {bookmarked ? <IconBookmarkFilled size={20} /> : <IconBookmark size={20} />}
                            </Button>
                            <Button variant="subtle" size="sm" radius="lg" onClick={handleShare}>
                                <IconShare size={20} />
                            </Button>
                            <Button variant="subtle" size="sm" radius="lg" onClick={explorePages}>
                                <IconSearch size={20} />
                            </Button>
                        </Group>
                    </Paper>
                    <Divider my="md" />
                    <Group>
                        <Avatar src={currentUser?.avatar || 'defaultAvatarUrl'} alt="Current User" radius="xl" />
                        <TextInput
                            placeholder="Post your reply"
                            radius="lg"
                            size="xl"
                            value={replyContent}
                            onChange={(e) => setReplyContent(e.target.value)}
                            rightSection={
                                <Button onClick={handleReplySubmit}>
                                    Send
                                </Button>
                            }
                            rightSectionWidth={100}
                            style={{ flex: 1 }}
                        />
                    </Group>
                    <Divider my="md" />
                    {replies.map((reply, index) => (
                        <div key={index}>
                            <Paper withBorder radius="md" mt={20} p="lg" style={{ position: 'relative' }} shadow="md">
                                <LoadingOverlay visible={loading} zIndex={1000} overlayProps={{ radius: "sm", blur: 2 }} />
                                <Group>
                                    <Avatar src={reply.account.avatar} alt={reply.account.username} radius="xl" />
                                    <div>
                                        <Text size="sm">{reply.account.username}</Text>
                                        <Text size="xs">{new Date(reply.created_at).toLocaleString()}</Text>
                                    </div>
                                </Group>
                                <Text pl={54} pt="sm" size="sm" dangerouslySetInnerHTML={{ __html: reply.content }} />
                                <Button onClick={() => handleNavigate(reply.id)}>view details</Button>
                            </Paper>
                        </div>
                    ))}
                </div>
                <div style={{ gridColumn: '2 / 3' }}>
                    {stacks()}
                    <RelatedStacks relatedStacks={relatedStacks} handleNavigate={handleNavigate} />
                </div>
            </div>
        </Shell>
    );
}
