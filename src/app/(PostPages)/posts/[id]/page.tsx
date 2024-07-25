"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Post from '../../../../components/Posts/Post';
import {
    Avatar,
    Group,
    LoadingOverlay,
    Paper,
    Text,
    Divider,
    Button,
    Modal,
    Container
} from "@mantine/core";
import { IconBookmark, IconHeart, IconMessageCircle, IconShare, IconHeartFilled, IconBookmarkFilled, IconLink  } from "@tabler/icons-react";
import axios from 'axios';
import ExpandModal from "../../../../components/ExpandModal";
import RelatedStacks from '../../../../components/RelatedStacks';
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
        username: string; 
    };
}

interface StackData {
   
    size: number;
}

export default function PostView({ params }: { params: { id: string } }) {
    const router = useRouter();
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

    const currentPostRef = useRef<HTMLDivElement>(null);
    const [relatedStacks, setRelatedStacks] = useState<any[]>([]);
    
    const [postLoaded, setPostLoaded] = useState(false);
    const [showAllReplies, setShowAllReplies] = useState(false);
    const [selectedTab, setSelectedTab] = useState(0);

    const tabColors = ["#f8d86a", "#b9dec9", "#b0d5df", "#f1c4cd"]; 
    const tabNames = ["Time", "Recommend", "Stacks of Summary", "Summary"]; 


    useEffect(() => {
        fetchPostAndReplies(id);
    }, [id]);

    useEffect(() => {
        fetchCurrentUser();
    }, []);

    useEffect(() => {
        if (currentPostRef.current !== null) {
            setTimeout(() => {
                window.scrollTo({
                    top: currentPostRef.current!.offsetTop,
                    behavior: 'smooth'
                });
            }, 300);
        }
    }, [ post,postLoaded]);

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
                in_reply_to_id: reply.in_reply_to_id,
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

            // Fetch stack IDs for each ancestor and reply
          
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

   

    const handleCopyLink = () => {
        const url = `${window.location.origin}/posts/${id}`;
        navigator.clipboard.writeText(url).then(() => {
          console.log('Link copied to clipboard:', url);
        }).catch((error) => {
          console.error('Error copying link:', error);
        });
      };

    const handleStackIconClick = async (postID: string) => {
        // const relatedStacks = await fetchRelatedStacks(postID);
        // setRelatedStacks(relatedStacks);
        // setRelatedStacksLoaded(true);
    };

    const renderAncestors  = (post: any) => {

        // const stackData = postStackIds[post.id] || { stackId: null, size: 0 };
        // const { stackId, size } = stackData;

        return (
            <Post
                key={post.id}
                id={post.id}
                text={post.content}
                author={post.account.username}
                account={post.account.acc}
                avatar={post.account.avatar}
                repliesCount={post.replies_count}
                createdAt={post.created_at}
                stackCount={9}
                favouritesCount={post.favourites_count}
                favourited={post.favourited}
                bookmarked={post.bookmarked}
                mediaAttachments={[]}
                onStackIconClick={() => post.id && handleStackIconClick(post.id)}
                setIsModalOpen={() => {}}
                setIsExpandModalOpen={()=>{}}
                relatedStacks={relatedStacks}
            />
        );
    };

    const handleShowMoreReplies = () => {
        setShowAllReplies(true);
    };

    const handleTabClick = (index: number) => {
        setSelectedTab(index);
        
    };
    


    const renderReplies = (post: any) => {

        if (post.in_reply_to_id !== id) {
            return null;
        }

        return (
            <Post
                key={post.id}
                id={post.id}
                text={post.content}
                author={post.account.username}
                account={post.account.acc}
                avatar={post.account.avatar}
            
                repliesCount={post.replies_count}
                createdAt={post.created_at}
                stackCount={9}
          
                favouritesCount={post.favourites_count}
                favourited={post.favourited}
                bookmarked={post.bookmarked}
                mediaAttachments={[]}
                onStackIconClick={() => post.id && handleStackIconClick(post.id)}
                setIsModalOpen={() => {}}
                setIsExpandModalOpen={()=>{}}
                relatedStacks={relatedStacks}
            />
        );
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
                {/* {post.id && <ExpandModal stackId={modalContent} />} */}
            </Modal>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', width: '100%' }}>
                <div style={{ gridColumn: '1 / 2', position: 'relative' }}>
                    <div style={{ position: 'relative', marginBottom: '2rem' }}>
                        {ancestors.map((ancestor) => (
                            <div key={ancestor.id} style={{ position: 'relative', marginBottom: '1rem' }}>
                                {renderAncestors(ancestor)}
                                <div style={{
                                    position: 'absolute',
                                    left: '20%',
                                    bottom: '-2rem',
                                    width: '2px',
                                    height: '2rem',
                                    backgroundColor: '#000',
                                    transform: 'translateX(-50%)'
                                }}></div>
                            </div>
                        ))}
                        <Paper ref={currentPostRef} withBorder radius="md" mt={20} p="lg" style={{ position: 'relative', zIndex: 5, backgroundColor: '#C5F6FA' }} shadow="lg">
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
                                <Button variant="subtle" size="sm" radius="lg" onClick={handleCopyLink}>
                                    <IconLink size={20} />
                                </Button>
                            </Group>
                           
                        </Paper>
                    </div>
                    <Divider my="md" />

                    <ReplySection
                        postId={id}
                        currentUser={currentUser}
                        fetchPostAndReplies={fetchPostAndReplies}
                    />

                    <Divider my="md" />


{
    replies.length > 0 && (
    <div style={{ display: 'flex', marginBottom: '0' }}>
    {tabColors.map((color, index) => (
        <div
            key={index}
            onClick={() => handleTabClick(index)}
            style={{
                backgroundColor: color,
                padding: '10px 20px',
                cursor: 'pointer',
                borderRadius: index === 0 ? '8px 0 0 0' : index === tabColors.length - 1 ? '0 8px 0 0' : '0',
                textAlign: 'center',
                color: 'white',
                fontWeight: 'bold',
                flex: 1,
                margin: 0
            }}
        >
            {tabNames[index]}
        </div>
    ))}
</div>
    )
}

{replies.length > 0 && (
    <Paper
        style={{
            padding: '20px',
            backgroundColor: tabColors[selectedTab],
            borderRadius: '0 0 8px 8px', 
            fontFamily: 'Roboto, sans-serif',
            fontSize: '14px',
            marginTop: 0 
        }}
    >
        {selectedTab === 0 && (
            <>
                {replies.slice(0, showAllReplies ? replies.length : 15).map((reply) => renderReplies(reply))}
                {!showAllReplies && replies.length > 15 && (
                    <Button onClick={handleShowMoreReplies} variant="outline" fullWidth style={{ marginTop: '10px' }}>
                        Show More
                    </Button>
                )}
            </>
        )}
        {selectedTab === 1 && (
            <div>This is tab for Quality</div>
        )}
        {selectedTab === 2 && (
            <div>This is tab for Stacks</div>
        )}
        {selectedTab === 3 && (
            <div>This is tab for Summary</div>
        )}
    </Paper>
)}

                    <div style={{ height: '100vh' }}></div>
                </div>
                <div style={{ gridColumn: '2 / 3' }}>
                    {relatedStacks.length > 0 && (
                        <RelatedStacks
                            relatedStacks={relatedStacks}
                            cardWidth={400}
                           
                            onStackClick={() => {}}
                            setIsExpandModalOpen={()=>{}}
                            // setIsModalOpen={()=>{}}
                        />
                    )}


                </div>
            </div>
        </Container>
    );
}