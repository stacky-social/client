"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Post from '../../../../components/Posts/Post'; 
import {
    Avatar,
    Group,
    LoadingOverlay,
    Paper,
    Text,
    Divider,
    Button,
    Modal, Container
} from "@mantine/core";
import { IconBookmark, IconHeart, IconMessageCircle, IconShare, IconHeartFilled, IconBookmarkFilled } from "@tabler/icons-react";
import axios from 'axios';
import ExpandModal from "../../../../components/ExpandModal";
import RelatedStacks from '../../../../components/RelatedStacks';
import RelatedStackStats from '../../../../components/RelatedStackStats';
import ReplySection from '../../../../components/ReplySection';

const MastodonInstanceUrl = 'https://beta.stacky.social';

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

export default function PostView({ params }: { params: { id: string } }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const stackIdFromParams = searchParams.get('stackId');
    const { id } = params;
    const [loading, setLoading] = useState(true);
    const [post, setPost] = useState<any | null>(null);
    const [replies, setReplies] = useState<any[]>([]);
    const [ancestors, setAncestors] = useState<any[]>([]);
    const [modalOpened, setModalOpened] = useState(false);
    const [modalContent, setModalContent] = useState<string>('');
    const [currentUser, setCurrentUser] = useState<any | null>(null);
    const [liked, setLiked] = useState(false);
    const [bookmarked, setBookmarked] = useState(false);
    const [likeCount, setLikeCount] = useState(0);
    const stackId = stackIdFromParams || null;
    const currentPostRef = useRef<HTMLDivElement>(null);
    const [relatedStacksLoaded, setRelatedStacksLoaded] = useState(false);
    const [postLoaded, setPostLoaded] = useState(false);

    

    useEffect(() => {
        fetchPostAndReplies(id);
    }, [id]);

    useEffect(() => {
        fetchCurrentUser();
    }, []);


    useEffect(() => {
        if (currentPostRef.current!==null) {
            setTimeout(() => {
                window.scrollTo({
                    top: currentPostRef.current!.offsetTop, 
                    behavior: 'smooth'
                });
            }, 100); 
        }
    }, [relatedStacksLoaded, post]); 
    
    
    
    

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
    
            const formattedReplies = repliesResponse.data.descendants.map((reply: any) => ({
                id: reply.id,
                created_at: reply.created_at,
                replies_count: reply.replies_count,
                favourites_count: reply.favourites_count,
                favourited: reply.favourited,
                bookmarked: reply.bookmarked,
                content: reply.content,
                account: {
                    avatar: reply.account.avatar,
                    username: reply.account.username 
                }
            }));
    
            setReplies(formattedReplies);
    
            const formattedAncestors = repliesResponse.data.ancestors.map((ancestor: any) => ({
                id: ancestor.id,
                created_at: ancestor.created_at,
                replies_count: ancestor.replies_count,
                favourites_count: ancestor.favourites_count,
                favourited: ancestor.favourited,
                bookmarked: ancestor.bookmarked,
                content: ancestor.content,
                account: {
                    avatar: ancestor.account.avatar,
                    username: ancestor.account.username 
                }
            }));
    
            setAncestors(formattedAncestors);
    
            setPostLoaded(true);  
        } catch (error) {
            console.error('Failed to fetch post or replies:', error);
        } finally {
            setLoading(false);
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

    const handleStackClick = (stackId: string) => {
        setModalContent(stackId);
        setModalOpened(true);
    };

    if (!post && !loading) {
        return (
            <Paper withBorder radius="md" mt={20} p="lg">
                <Text size="sm">Post not found.</Text>
            </Paper>
        );
    }

    return (
        <Container fluid>
            <Modal
                opened={modalOpened}
                onClose={() => setModalOpened(false)}
                title="Expand Content"
                centered
                size="auto"
            >
                {stackId && <ExpandModal stackId={modalContent} />}
            </Modal>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', width: '100%' }}>
                <div style={{ gridColumn: '1 / 2', position: 'relative' }}>
                    <div style={{ position: 'relative', marginBottom: '2rem' }}>
                    {ancestors.map((ancestor) => (
                        <Post
                            key={ancestor.id}
                            id={ancestor.id}
                            text={ancestor.content}
                            author={ancestor.account.username}
                            avatar={ancestor.account.avatar}
                            repliesCount={ancestor.replies_count}
                            createdAt={ancestor.created_at}
                            stackCount={null}
                            stackId={null}
                            favouritesCount={ancestor.favourites_count}
                            favourited={ancestor.favourited}
                            bookmarked={ancestor.bookmarked}
                            mediaAttachments={[]}
                        />
                    ))}
                        
                        <Paper  ref={currentPostRef} withBorder radius="md" mt={20} p="lg" style={{ position: 'relative', zIndex: 5, backgroundColor: '#C5F6FA' }} shadow="lg" >
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
                            <Text pl={54} pt="sm" size="sm">Stack Id: {stackId}</Text>
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
                            </Group>
                            {stackId && <RelatedStackStats stackId={stackId} />}
                        </Paper>
                
                    </div>
                    <Divider my="md" />

                    <ReplySection
                        postId={id}
                        currentUser={currentUser}
                        fetchPostAndReplies={fetchPostAndReplies}
                    />

                    <Divider my="md" />

                    {replies.map((reply) => (
                        <Post
                            key={reply.id}
                            id={reply.id}
                            text={reply.content}
                            author={reply.account.username}
                            avatar={reply.account.avatar}
                            repliesCount={reply.replies_count}
                            createdAt={reply.created_at}
                            stackCount={null}
                            stackId={null}
                            favouritesCount={reply.favourites_count}
                            favourited={reply.favourited}
                            bookmarked={reply.bookmarked}
                            mediaAttachments={[]}
                        />
                    ))}
                </div>
                <div style={{ gridColumn: '2 / 3' }}>
                    {stackId && <RelatedStacks stackId={id} cardWidth={400} cardHeight={200} onStackClick={handleStackClick} onLoadComplete={() => console.log('Related stacks have loaded')} />}
                </div>
            </div>
        </Container>
    );
}
