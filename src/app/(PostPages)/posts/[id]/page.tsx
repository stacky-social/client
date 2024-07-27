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
    Container,
    UnstyledButton
} from "@mantine/core";
import { IconBookmark, IconHeart, IconMessageCircle, IconShare, IconHeartFilled, IconBookmarkFilled, IconLink  } from "@tabler/icons-react";
import axios from 'axios';

import RelatedStacks from '../../../../components/RelatedStacks';
import ReplySection from '../../../../components/ReplySection';
import { AnimatePresence, motion } from 'framer-motion';
import { set } from 'date-fns';

interface PostType {
    id: string;
    content: string;
    account: {
        username: string;
        acc: string;
        avatar: string;
    };
    replies_count: number;
    created_at: string;
    stackCount: number | null;
    favourites_count: number;
    favourited: boolean;
    bookmarked: boolean;
    media_attachments: any[];
    relatedStacks: any[];
}


const MastodonInstanceUrl = 'https://beta.stacky.social';

export default function PostView({ params }: { params: { id: string } }) {
    const router = useRouter();
    const { id } = params;
    
    const [loading, setLoading] = useState(true);
    const [post, setPost] = useState<any | null>(null);
    const [replies, setReplies] = useState<any[]>([]);
    const [ancestors, setAncestors] = useState<any[]>([]);
    const [modalOpened, setModalOpened] = useState(false);
    const [currentUser, setCurrentUser] = useState<any | null>(null);
    const [liked, setLiked] = useState(false);
    const [bookmarked, setBookmarked] = useState(false);
    const [likeCount, setLikeCount] = useState(0);

    const relatedStacksRef = useRef<HTMLDivElement>(null);
    const currentPostRef = useRef<HTMLDivElement>(null);
    const [relatedStacks, setRelatedStacks] = useState<any[]>([]);

    
    
    const [postLoaded, setPostLoaded] = useState(false);
    const [showAllReplies, setShowAllReplies] = useState(false);
    const [selectedTab, setSelectedTab] = useState(0);
    const [activePostId, setActivePostId] = useState<string | null>(null);
    const [postPosition, setPostPosition] = useState<{ top: number, height: number } | null>(null);

    const [focuspostPosition, setFocusPostPosition] = useState<{ top: number, height: number } | null>(null);

    const [showFocusRelatedStacks, setShowFocusRelatedStacks] = useState(true);
    const [focus_relatedStacks, setFocus_relatedStacks] = useState<any[]>([]);
   
    const [recommendedPosts, setRecommendedPosts] = useState<any[]>([]);

    const [hasScrolled, setHasScrolled] = useState(false); 
 

    const tabColors = ["#f8d86a", "#b9dec9", "#b0d5df", "#f1c4cd"]; 
    const tabNames = ["Time", "Recommended", "Stacked", "Summary"]; 

    useEffect(() => {
        const storedRelatedStacks = localStorage.getItem('relatedStacks');
        if (storedRelatedStacks) {
            const parsedStacks = JSON.parse(storedRelatedStacks);
            setFocus_relatedStacks(parsedStacks);
            console.log('Parsed Stacks:', parsedStacks);

        }
    }, []);

    useEffect(() => {
        console.log('Related Stacks:', focus_relatedStacks);
    }, [focus_relatedStacks]);


    useEffect(() => {
        fetchPostAndReplies(id);
    }, [id]);

    useEffect(() => {
        fetchCurrentUser();
    }, []);

    useEffect(() => {
        if (currentPostRef.current !== null && !hasScrolled) {
            setFocusPostPosition({ top: currentPostRef.current.offsetTop, height: currentPostRef.current.offsetHeight });
            setTimeout(() => {
                window.scrollTo({
                    top: currentPostRef.current!.offsetTop,
                    behavior: 'smooth'
                });
                setHasScrolled(true); // 设置已滑动标志
            }, 300);
        }
    }, [post, postLoaded, hasScrolled]);

   


    useEffect(() => {
        if (postLoaded) {
            // fetchRelatedStacks(post);
            replies.forEach(reply => fetchRelatedStacks(reply));
            ancestors.forEach(ancestor => fetchRelatedStacks(ancestor));
        }
    }, [postLoaded]);

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
            setPost({
                ...postResponse.data,
                relatedStacks: [],
                stackCount: null
            });
            setLiked(postResponse.data.favourited);
            setBookmarked(postResponse.data.bookmarked);
            setLikeCount(postResponse.data.favourites_count);

            const repliesResponse = await axios.get(`${MastodonInstanceUrl}/api/v1/statuses/${postId}/context`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            const formattedReplies = repliesResponse.data.descendants.map((reply: any) => ({
                ...reply,
                relatedStacks: [],
                stackCount: null
            }));

            setReplies(formattedReplies);

            const formattedAncestors = repliesResponse.data.ancestors.map((ancestor: any) => ({
                ...ancestor,
                relatedStacks: [],
                stackCount: null
            }));

            setAncestors(formattedAncestors);
    

            setPostLoaded(true);

        } catch (error) {
            console.error('Failed to fetch post or replies:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchRelatedStacks = async (post: any) => {
        const accessToken = localStorage.getItem('accessToken');
        if (!accessToken) {
            console.error('Access token is missing.');
            return;
        }

        try {
            const response = await axios.get(`${MastodonInstanceUrl}:3002/stacks/${post.id}/related`, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                }
            });
            const stackData = response.data.relatedStacks || [];
            const stackCount = response.data.size;
            setPost((prevPost: PostType | null) => ({
                ...prevPost,
                relatedStacks: post.id === prevPost?.id ? stackData : prevPost?.relatedStacks,
                stackCount: post.id === prevPost?.id ? stackCount : prevPost?.stackCount
            }));
            setReplies((prevReplies) =>
                prevReplies.map((p) =>
                    p.id === post.id
                        ? { ...p, stackCount: stackCount, relatedStacks: stackData }
                        : p
                )
            );
            setAncestors((prevAncestors) =>
                prevAncestors.map((p) =>
                    p.id === post.id
                        ? { ...p, stackCount: stackCount, relatedStacks: stackData }
                        : p
                )
            );
            setRecommendedPosts((prevPosts) =>prevPosts.map((p) =>
                p.id === post.id
                    ? { ...p, stackCount: stackCount, relatedStacks: stackData }
                    : p
            )
        );
        } catch (error) {
            console.error(`Error fetching stack data for post ${post.id}:`, error);
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

    const handleStackIconClick = (
        relatedStacks: any[],
        postId: string,
        position: { top: number, height: number }
    ) => {
      
        setShowFocusRelatedStacks(false);
        setRelatedStacks(relatedStacks);
        setActivePostId(postId);
        setPostPosition(position);
    };
    

    const handleFocusPostClick = () => {
        setShowFocusRelatedStacks(true);
        setActivePostId(null);
        
    }

    const renderAncestors = (post: any) => {
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
                stackCount={post.stackCount}
                favouritesCount={post.favourites_count}
                favourited={post.favourited}
                bookmarked={post.bookmarked}
                mediaAttachments={[]}
                onStackIconClick={handleStackIconClick}
                setIsModalOpen={() => {}}
                setIsExpandModalOpen={() => {}}
                relatedStacks={post.relatedStacks}
                setActivePostId={setActivePostId}
                activePostId={activePostId}

            />
        );
    };

    const handleShowMoreReplies = () => {
        setShowAllReplies(true);
    };

    const handleTabClick = async (index: number) => {
        setSelectedTab(index);
    
        if (index === 1) { // 1 corresponds to the "Recommend" tab
            try {
                console.log('Fetching recommended posts...');
                const response = await axios.get(`https://beta.stacky.social/api/v1/timelines/public`);
                console.log('Response data:', response.data);
    
                const posts = response.data;
                const formattedPosts: PostType[] = posts.map((post: PostType) => ({
                    ...post,
                    relatedStacks: [],
                    stackCount: null
                }));
    
                console.log('Formatted posts:', formattedPosts);
    
                setPostLoaded(false);
                setRecommendedPosts(formattedPosts);
                setPostLoaded(true);
    
                formattedPosts.forEach((post: PostType) => {
                    console.log('Fetching related stacks for post:', post);
                    fetchRelatedStacks(post);
                });
            } catch (error) {
                console.error('Failed to fetch recommended posts:', error);
            }
        }
    };
    
    
    const renderRecommendedPosts = (post: any) => {
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
                stackCount={post.stackCount}
                favouritesCount={post.favourites_count}
                favourited={post.favourited}
                bookmarked={post.bookmarked}
                mediaAttachments={[]}
                onStackIconClick={handleStackIconClick}
                setIsModalOpen={() => {}}
                setIsExpandModalOpen={() => {}}
                relatedStacks={post.relatedStacks}
                setActivePostId={setActivePostId}
                activePostId={activePostId}
            />
        );
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
                stackCount={post.stackCount}
                favouritesCount={post.favourites_count}
                favourited={post.favourited}
                bookmarked={post.bookmarked}
                mediaAttachments={[]}
                onStackIconClick={handleStackIconClick}
                setIsModalOpen={() => {}}
                setIsExpandModalOpen={() => {}}
                relatedStacks={post.relatedStacks}
                setActivePostId={setActivePostId}
                activePostId={activePostId}
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
            </Modal>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', width: '100%' }}>
                <div style={{ gridColumn: '1 / 2', position: 'relative' }}>
                    <div style={{ position: 'relative', marginBottom: '2rem' }}>
                        {ancestors.map((ancestor) => (
                            <div key={ancestor.id} style={{ position: 'relative', marginBottom: '1rem', marginLeft: '40px'}}>
                                {renderAncestors(ancestor)}
                                <div style={{
                                    position: 'absolute',
                                    left: '10%',
                                    bottom: '-2rem',
                                    width: '2px',
                                    height: '2rem',
                                    backgroundColor: '#393733', // Change to light gray
                                    transform: 'translateX(-50%)'
                                }}></div>
                            </div>
                        ))}

<Paper 
    ref={currentPostRef} 
    withBorder 
    radius="md" 
    mt={20} 
    p="lg" 
    style={{ 
        position: 'relative', 
        zIndex: 5, 
        backgroundColor: showFocusRelatedStacks ? '#C5F6FA' : '#FFFFFF' 
    }} 
    shadow="lg"
>
    <LoadingOverlay visible={loading} zIndex={1000} overlayProps={{ radius: "sm", blur: 2 }} />
    <UnstyledButton onClick={handleFocusPostClick}>
        <Group>
            <Avatar src={post?.account.avatar} alt={post?.account.username} radius="xl" />
            <div>
                <Text size="lg">{post?.account.username}</Text> {/* 调整此处 */}
                <Text size="md">{new Date(post?.created_at).toLocaleString()}</Text> {/* 调整此处 */}
            </div>
        </Group>
        <Text pl={54} pt="sm" size="lg" dangerouslySetInnerHTML={{ __html: post?.content }} /> {/* 调整此处 */}
        {post?.media_attachments && post.media_attachments.map((attachment: any) => (
            <div key={attachment.id}>
                {attachment.type === 'image' && (
                    <img src={attachment.url} alt={attachment.description} style={{ maxWidth: '100%', marginTop: '10px' }} />
                )}
            </div>
        ))}
        <Text pl={54} pt="sm" size="lg">Post Id: {post?.id}</Text> {/* 调整此处 */}
    </UnstyledButton>
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

                    {replies.length > 0 && (
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
                    )}

                    {replies.length > 0 && (
                        <Paper
                            style={{
                                padding: '20px',
                                backgroundColor: tabColors[selectedTab],
                                borderRadius: '0 0 8px 8px', 
                                fontFamily: 'Roboto, sans-serif',
                                fontSize: '14px',
                                marginTop: 0,
                                maxWidth: '800px',
                                width:'100%'
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
                                <>
                                    {recommendedPosts.map((post) => renderRecommendedPosts(post))}
                                </>
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

                <div ref={relatedStacksRef} style={{ position: 'relative' }}>
              


                {
                showFocusRelatedStacks &&
                focus_relatedStacks.length > 0 && (
                    <AnimatePresence>
                    { focuspostPosition && (
                        <motion.div
                            style={{
                                position: 'absolute',
                                top: focuspostPosition.top,
                                left: 20,
                                zIndex: 10
                            }}
                            initial={{ opacity: 0, x: -200 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -200 }}
                            transition={{ duration: 0.2 }}
                        >
            
            
                            <RelatedStacks
                                relatedStacks={focus_relatedStacks}
                                cardWidth={450}
                                onStackClick={() => {}}
                                setIsExpandModalOpen={() => {}}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
                )
              } 

    

    <AnimatePresence>
        { !showFocusRelatedStacks && 
        postPosition && (
            <motion.div
                style={{
                    position: 'absolute',
                    top: postPosition.top-100,
                    left: 20,
                    zIndex: 10
                }}
                initial={{ opacity: 0, x: -200 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -200 }}
                transition={{ duration: 0.2 }}
            >


                <RelatedStacks
                    relatedStacks={relatedStacks}
                    cardWidth={450}
                    onStackClick={() => {}}
                    setIsExpandModalOpen={() => {}}
                />
            </motion.div>
        )}
    </AnimatePresence>
</div>
              

                </div>
            </div>
        </Container>
    );
}
