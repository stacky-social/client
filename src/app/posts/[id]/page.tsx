"use client";

import React, { useState, useEffect, useRef } from 'react';
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
    TextInput,
    Modal
} from "@mantine/core";
import { IconBookmark, IconHeart, IconMessageCircle, IconShare, IconSearch, IconHeartFilled, IconBookmarkFilled } from "@tabler/icons-react";
import axios from 'axios';
import ExpandModal from "../../../components/ExpandModal";
import RelatedStacks from '../../../components/RelatedStacks';
import RelatedStackStats from '../../../components/RelatedStackStats';

const MastodonInstanceUrl = 'https://beta.stacky.social'; // Mastodon instance URL

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
    const [stackId, setStackId] = useState<string | null>(null);

    const paperRef = useRef<HTMLDivElement | null>(null);
    const [cardWidth, setCardWidth] = useState(0);
    const [cardHeight, setCardHeight] = useState(0);

    useEffect(() => {
        if (paperRef.current) {
            const { width, height } = paperRef.current.getBoundingClientRect();
            const margin = 20; 
            setCardWidth(width - 40); // Adjust the width as needed
            setCardHeight(height + margin*4); // Adjust the height as needed
        }
    }, [paperRef.current]);

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

    const handleStackClick = (stackId: string) => { 
        setModalContent(stackId);
        setModalOpened(true);
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
                <ExpandModal stackId={modalContent} />
            </Modal>
    
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', width: '100%' }}>
                <div style={{ gridColumn: '1 / 2', position: 'relative' }}>
                    <div style={{ position: 'relative', marginBottom: '2rem' }}>
                        <Paper ref={paperRef} withBorder radius="md" mt={20} p="lg" style={{ position: 'relative', zIndex: 5 }} shadow="lg">
                            <LoadingOverlay visible={loading} zIndex={1000} overlayProps={{ radius: "sm", blur: 2 }} />
                            <Group>
                                <Avatar src={post?.account.avatar} alt={post?.account.username} radius="xl" />
                                <div>
                                    <Text size="sm">{post?.account.username}</Text>
                                    <Text size="xs">{new Date(post?.created_at).toLocaleString()}</Text>
                                </div>
                            </Group>
                            <Text pl={54} pt="sm" size="sm" dangerouslySetInnerHTML={{ __html: post?.content }} />
                            {post?.media_attachments && post.media_attachments.map((attachment: any) => (
                                <div key={attachment.id}>
                                    {attachment.type === 'image' && (
                                        <img src={attachment.url} alt={attachment.description} style={{ maxWidth: '100%', marginTop: '10px' }} />
                                    )}
                                
                                </div>
                            ))}
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
                            <RelatedStackStats stackId={id} />
                        </Paper>
                    </div>
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
                                {reply.media_attachments && reply.media_attachments.map((attachment: any) => (
                                    <div key={attachment.id}>
                                        {attachment.type === 'image' && (
                                            <img src={attachment.url} alt={attachment.description} style={{ maxWidth: '100%', marginTop: '10px' }} />
                                        )}
                                        
                                    </div>
                                ))}
                                <Button onClick={() => handleNavigate(reply.id)}>view details</Button>
                            </Paper>
                        </div>
                    ))}
                </div>
                <div style={{ gridColumn: '2 / 3' }}>
                    <RelatedStacks postId={id} cardWidth={400} cardHeight={200} onStackClick={handleStackClick} />
                </div>
            </div>
        </Shell>
    );
}    