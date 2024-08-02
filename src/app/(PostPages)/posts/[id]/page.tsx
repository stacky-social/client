"use client";

import React, {useState, useEffect, useRef} from 'react';
import {useRouter} from 'next/navigation';
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
import {
    IconBookmark,
    IconHeart,
    IconMessageCircle,
    IconShare,
    IconHeartFilled,
    IconBookmarkFilled,
    IconLink
} from "@tabler/icons-react";
import axios from 'axios';

import StackCount from '../../../../components/StackCount';

import RelatedStacks from '../../../../components/RelatedStacks';
import RepliesStack from '../../../../components/RepliesStack';
import ReplySection from '../../../../components/ReplySection';
import {AnimatePresence, motion} from 'framer-motion';
import {Loader} from '@mantine/core';

import { Tabs } from '@mantine/core';

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

export default function PostView({params}: { params: { id: string } }) {
    const router = useRouter();
    const {id} = params;

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
    const [loadingMoreReplies, setLoadingMoreReplies] = useState(false);


    const [visibleReplies, setVisibleReplies] = useState(15);

    const [size, setSize] = useState(0);

    const [postLoaded, setPostLoaded] = useState(false);
    const [showAllReplies, setShowAllReplies] = useState(false);
    const [selectedTab, setSelectedTab] = useState(0);
    const [activePostId, setActivePostId] = useState<string | null>(null);
    const [postPosition, setPostPosition] = useState<{ top: number, height: number } | null>(null);

    const [activeTab, setActiveTab] = useState('time');
  const iconStyle = { width: '12px', height: '12px' };

    const [focuspostPosition, setFocusPostPosition] = useState<{ top: number, height: number } | null>(null);

    const [showFocusRelatedStacks, setShowFocusRelatedStacks] = useState(true);
    const [focus_relatedStacks, setFocus_relatedStacks] = useState<any[]>([]);

    const [recommendedPosts, setRecommendedPosts] = useState<any[]>([]);
    const [recommendedLoading, setRecommendedLoading] = useState(false);

    const [hasScrolled, setHasScrolled] = useState(false);

    const [repliesStack, setRepliesStack] = useState<any[]>([]); // 添加用于存储 repliesStack 的状态
    const [loadingRepliesStack, setLoadingRepliesStack] = useState(false); // 添加加载状态

    const [summary, setSummary] = useState<string | null>(null);

    const[focusPostLoaded, setFocusPostLoaded] = useState(false);
    const [postRendered, setPostRendered] = useState(false); // 新增状态变量


    const [isExpanded, setIsExpanded] = useState(true);

    const handleTabChange = async (value: string | null) => {
        if (value !== null) {
          setActiveTab(value);
    
          if (value === 'recommended') {
            console.log('Fetching recommended posts...');
            setRecommendedLoading(true);
    
            try {
              console.log('Fetching recommended posts...');
              const accessToken = localStorage.getItem('accessToken');
              const response = await axios.post(`https://beta.stacky.social:3002/replies/${id}/list`, {
                immediateReplyIDs: replyIDs,
              }, {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                }
              });
    
              console.log('Response data:', response.data);
              const posts = response.data;
              const formattedPosts = posts.map((post:any[]) => ({
                ...post,
                relatedStacks: [],
                stackCount: null,
              }));
    
              console.log('Formatted posts:', formattedPosts);
    
              setRecommendedPosts(formattedPosts);
              setRecommendedLoading(false);
    
              formattedPosts.forEach((post:any[]) => {
                console.log('Fetching related stacks for post:', post);
                fetchRelatedStacks(post);
              });
            } catch (error) {
              console.error('Failed to fetch recommended posts:', error);
              setRecommendedLoading(false);
            }
          } else if (value === 'stacked') {
            setLoadingRepliesStack(true);
            await fetchRepliesStack(id);
            setLoadingRepliesStack(false);
          } else if (value === 'summary') {
            try {
              const accessToken = localStorage.getItem('accessToken');
              const response = await axios.post(`https://beta.stacky.social:3002/replies/${id}/summary`, {
                immediateReplyIDs: replyIDs,
              }, {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                }
              });
    
              console.log('Summary Response:', response.data);
              setSummary(response.data.summary);
            } catch (error) {
              console.error('Failed to fetch summary:', error);
            }
          }
        }
      };
    const handleStackClick = (index: number) => {
        const newRelatedStacks = [...focus_relatedStacks];
        const [clickedStack] = newRelatedStacks.splice(index, 1);
        newRelatedStacks.unshift(clickedStack);
        setFocus_relatedStacks(newRelatedStacks);
    
        const position = currentPostRef.current ? currentPostRef.current.getBoundingClientRect() : { top: 0, height: 0 };
        const adjustedPosition = { top: position.top + window.scrollY, height: position.height };

        setFocusPostPosition(adjustedPosition);

      };
    

    useEffect(() => {
        console.log('Recommended Loading changed:', recommendedLoading);
    }, [recommendedLoading]);

    
    // const tabColors = ["#f8d86a", "#b9dec9", "#b0d5df", "#f1c4cd"];
    const tabColors = ["#fdf7e0", "#b9dec9", "#b0d5df", "#f1c4cd"];
    const tabNames = ["Time", "Recommended", "Stacked", "Summary"];

    useEffect(() => {
        const fetchRelatedStacksFromAPI = async () => {
            const accessToken = localStorage.getItem('accessToken');
            if (!accessToken) {
                console.error('Access token is missing.');
                return;
            }
    
            try {
                const response = await axios.get(`${MastodonInstanceUrl}:3002/stacks/${id}/related`, {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    }
                });
                const stackData = response.data.relatedStacks || [];
                const stackSize = response.data.size;
    
                setFocus_relatedStacks(stackData);
                setSize(stackSize);
    
                console.log('Fetched Stacks from API:', stackData);
            } catch (error) {
                console.error('Error fetching related stacks from API:', error);
            }
        };
    
        const storedRelatedStacks = localStorage.getItem('relatedStacks');
        const storedsize = localStorage.getItem('relatedStacksSize');
        if (storedRelatedStacks && storedsize) {
            const parsedStacks = JSON.parse(storedRelatedStacks);
            setFocus_relatedStacks(parsedStacks);
            setSize(parseInt(storedsize));
    
            console.log('Parsed Stacks:', parsedStacks);
    
     
            localStorage.removeItem('relatedStacks');
            localStorage.removeItem('relatedStacksSize');
        } else {
            fetchRelatedStacksFromAPI();
        }
    }, [id]);
    
    

    useEffect(() => {
        console.log('Related Stacks:', focus_relatedStacks);
    }, [focus_relatedStacks]);


    useEffect(() => {
     
        fetchPostAndReplies(id);
        fetchPost(id);
        const position = currentPostRef.current ? currentPostRef.current.getBoundingClientRect() : { top: 0, height: 0 };
        const adjustedPosition = { top: position.top + window.scrollY, height: position.height };
        setFocusPostPosition(adjustedPosition);
  
    },[id])
    
    // useEffect(() => {
    

    //     fetchPostAndReplies(id);
    // },[focusPostLoaded])
   


    useEffect(() => {
        fetchCurrentUser();
    }, []);

    useEffect(() => {
        if (post !== null && currentPostRef.current !== null && !hasScrolled) {
            const position = currentPostRef.current.getBoundingClientRect();
            const adjustedPosition = { top: position.top + window.scrollY, height: position.height };
            setFocusPostPosition(adjustedPosition);
            setTimeout(() => {
                window.scrollTo({
                    top: currentPostRef.current!.offsetTop,
                    // behavior: 'smooth'
                });
                setHasScrolled(true);
            }, 300);
        }
        const position = currentPostRef.current ? currentPostRef.current.getBoundingClientRect() : { top: 0, height: 0 };
        const adjustedPosition = { top: position.top + window.scrollY, height: position.height };
        setFocusPostPosition(adjustedPosition);
    }, [focusPostLoaded, hasScrolled]);
    

    useEffect(() => {
        const position = currentPostRef.current ? currentPostRef.current.getBoundingClientRect() : { top: 0, height: 0 };
    const adjustedPosition = { top: position.top + window.scrollY, height: position.height };
    setFocusPostPosition(adjustedPosition);
},[currentPostRef.current])
    

    
    useEffect(()=>{

        console.log("Focus Post Position:", focuspostPosition);
    },[focuspostPosition])

    useEffect(() => {
        if (postLoaded) {
            // fetchRelatedStacks(post);
            replies.forEach(reply => fetchRelatedStacks(reply));
            ancestors.forEach(ancestor => fetchRelatedStacks(ancestor));
        }
    }, [postLoaded]);

    const filteredReplies = replies.filter(reply => reply.in_reply_to_id === id);
    useEffect(() => {
        console.log('Filtered Replies:', filteredReplies);
    }, [filteredReplies]);
    const replyIDs = filteredReplies.map(reply => reply.id); 


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


    const fetchPost= async (postId: string) => {
        const accessToken = localStorage.getItem('accessToken');
        console.log("fetching post");
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
                relatedStacks: focus_relatedStacks,
                stackCount: null
            });
            setLiked(postResponse.data.favourited);
            setBookmarked(postResponse.data.bookmarked);
            setLikeCount(postResponse.data.favourites_count);
            setFocusPostLoaded(true);
        } catch (error) {
            console.error('Failed to fetch post:', error);
        } finally {
            setLoading(false);
        }

        // if (post!== null &&currentPostRef.current !== null) {
        //     setFocusPostPosition({top: currentPostRef.current.offsetTop, height: currentPostRef.current.offsetHeight});
        //     setTimeout(() => {
        //         window.scrollTo({
        //             top: currentPostRef.current!.offsetTop,
        //             // behavior: 'smooth'
        //         });
        //         setHasScrolled(true);
        //     },0);
        // }
    }

    

    const fetchPostAndReplies = async (postId: string) => {
    
        const accessToken = localStorage.getItem('accessToken');
        if (!accessToken) {
            console.error('Access token is missing.');
            setLoading(false);
            return;
        }

        try {
            console.log('Fetching ancestor & replies...');

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

            console.log("Formatted Replies:", formattedReplies);
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



    const fetchRepliesStack = async (postId: string) => { // 添加用于获取 repliesStack 的函数
        const accessToken = localStorage.getItem('accessToken');
        if (!accessToken) {
            console.error('Access token is missing.');
            return;
        }

        setLoadingRepliesStack(true);

        try {
          

            const accessToken = localStorage.getItem('accessToken');
                const response = await axios.post(`https://beta.stacky.social:3002/replies/${id}/stacks?no_cache=true`, {
                    immediateReplyIDs: replyIDs
                }, {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    }
                });
                console.log('Replies Stack Response:', response.data);
            setRepliesStack(response.data);
        } catch (error) {
            console.error(`Error fetching replies stack data for post ${postId}:`, error);
        } finally {
            setLoadingRepliesStack(false);
        }
    };





    const fetchRelatedStacks = async (post: any) => {
        const accessToken = localStorage.getItem('accessToken');
        if (!accessToken) {
            console.error('Access token is missing.');
            return;
        }

        try {
            console.log('Fetching related stacks for post:', post);
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
                        ? {...p, stackCount: stackCount, relatedStacks: stackData}
                        : p
                )
            );
            setAncestors((prevAncestors) =>
                prevAncestors.map((p) =>
                    p.id === post.id
                        ? {...p, stackCount: stackCount, relatedStacks: stackData}
                        : p
                )
            );
            setRecommendedPosts((prevPosts) => prevPosts.map((p) =>
                    p.id === post.id
                        ? {...p, stackCount: stackCount, relatedStacks: stackData}
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
setIsExpanded(false);
        setShowFocusRelatedStacks(false);
        setRelatedStacks(relatedStacks);
        setActivePostId(postId);
        setPostPosition(position);
    };


    const handleFocusPostClick = () => {
        setIsExpanded(true);
        setShowFocusRelatedStacks(true);
        const position = currentPostRef.current ? currentPostRef.current.getBoundingClientRect() : { top: 0, height: 0 };
        const adjustedPosition = { top: position.top + window.scrollY, height: position.height };
        setFocusPostPosition(adjustedPosition);
        setActivePostId(null);

    }

    const handleMouseUp = () => {
        const selection = window.getSelection();
        if (selection && selection.toString().length === 0) {
            handleFocusPostClick();
        }
    };

    const renderAncestors = (post: any) => {
        console.log('Rendering ancestor:', post);
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
                setIsModalOpen={() => {
                }}
                setIsExpandModalOpen={() => {
                }}
                relatedStacks={post.relatedStacks}
                setActivePostId={setActivePostId}
                activePostId={activePostId}

            />
        );
    };

    const handleShowMoreReplies = () => {
        setLoadingMoreReplies(true);
        setTimeout(() => {
            setVisibleReplies((prevVisibleReplies) => {
                console.log('Prev visible replies:', prevVisibleReplies);
                const newVisibleReplies = prevVisibleReplies + 15;
                return newVisibleReplies >= filteredReplies.length ? filteredReplies.length : newVisibleReplies;
            });
            setLoadingMoreReplies(false);
        }, 0);
    };

    const handleTabClick = async (index: number) => {
        setSelectedTab(index);

        if (index === 1) { // 1 corresponds to the "Recommend" tab
            console.log('Fetching recommended posts...');

            setRecommendedLoading(true);
            console.log('Recommended Loading:', recommendedLoading);
            try {
                console.log('Fetching recommended posts...');
                // const response = await axios.get(`https://beta.stacky.social:3002/replies/${id}/list`);
                console.log("Reply IDs:", replyIDs);
                const accessToken = localStorage.getItem('accessToken');
                const response = await axios.post(`https://beta.stacky.social:3002/replies/${id}/list`, {
                    immediateReplyIDs: replyIDs
                }, {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    }
                });
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
                console.log('Recommended Posts:', recommendedPosts);
                setRecommendedLoading(false);
                console.log('Recommended Loading:', recommendedLoading);
                setPostLoaded(true);


                formattedPosts.forEach((post: PostType) => {
                    console.log('Fetching related stacks for post:', post);
                    fetchRelatedStacks(post);
                });
            } catch (error) {
                console.error('Failed to fetch recommended posts:', error);
            }
            
        }
        else if (index === 2) { // 2 corresponds to the "Stacked" tab
            await fetchRepliesStack(id); 
        }
        else if(index==3){

            try {
                const accessToken = localStorage.getItem('accessToken');
                const response = await axios.post(`https://beta.stacky.social:3002/replies/${id}/summary`, {
                    immediateReplyIDs: replyIDs
                }, {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    }
                });
                console.log('Summary Response:', response.data);
                setSummary(response.data.summary); 
                
            } catch (error) {
                console.error('Failed to fetch summary:', error);
            }

        }
    };


    const renderRecommendedPosts = (post: any) => {
        console.log('Rendering recommended post:', post);
        return (
            <div style={{position: 'relative'}}>

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
                    setIsModalOpen={() => {
                    }}
                    setIsExpandModalOpen={() => {
                    }}
                    relatedStacks={post.relatedStacks}
                    setActivePostId={setActivePostId}
                    activePostId={activePostId}
                />
            </div>
        );
    };


    const renderReplies = (post: any) => {
        console.log('Rendering reply:', post);

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
                setIsModalOpen={() => {
                }}
                setIsExpandModalOpen={() => {
                }}
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

            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', width: '100%'}}>
                <div style={{gridColumn: '1 / 2', position: 'relative'}}>
                    <div style={{position: 'relative', marginBottom: '2rem'}}>
           
                    {ancestors.map((ancestor) => (
                            <div key={ancestor.id} style={{ position: 'relative', marginBottom: '1rem', marginLeft: '40px' }}>
                                {renderAncestors(ancestor)}
                                <div style={{
                                    position: 'absolute',
                                    left: '10%',
                                    bottom: '-3rem',
                                    width: '2px',

                                    height: '3rem',
                                    backgroundColor: '#545454', // Change to light gray
                                    transform: 'translateX(-50%)',
                                    zIndex: 0

                                }}></div>
                            </div>
                        ))}
 <div className=""
 
 >
                        <Paper
                            ref={currentPostRef}
                            // withBorder
                            // radius="md"
                            radius={0}
                            mt={20}
                            p="lg"
                            style={{
                                position: 'relative',
                                zIndex: 5,
                                backgroundColor: showFocusRelatedStacks ? '#f6f3e1' : '#FFFFFF',
                                width: '90%',
                            }}
            
                
                            shadow="lg"
                        >

{
                size > 1 && (
                    <UnstyledButton onClick={handleFocusPostClick}>
           
                    <StackCount
                    cardHeight={600}
                      count={size}
                      onClick={handleFocusPostClick}
                      onStackClick={handleStackClick}
                      relatedStacks={focus_relatedStacks}
                      expanded={isExpanded} 
                 
                    />
                  </UnstyledButton>
                )
            }
         
       
                  
                  
        <UnstyledButton onClick={handleFocusPostClick}>
            <Group>
        <Avatar src={post?.account.avatar} alt={post?.account.username} radius="xl" />
        <div>
            <Text style={{ color: '#011445' }} fw={700} size="xl">{post?.account.username}</Text>
            <Text c='dimmed' size="md">{new Date(post?.created_at).toLocaleString()}</Text>
        </div>
    </Group>
    </UnstyledButton>
    <div onMouseUp={handleMouseUp}>
    <div>
        <Text 
            pl={54} 
            pt="sm" 
            size="lg" 
            fw="500"
            style={{ color: '#011445' }} 
            dangerouslySetInnerHTML={{ __html: post?.content }}
        />
            </div>
    </div>
    
    {post?.media_attachments && post.media_attachments.map((attachment: any) => (
        <div key={attachment.id}>
            {attachment.type === 'image' && (
                <img src={attachment.url} alt={attachment.description} style={{ maxWidth: '100%', marginTop: '10px' }} />
            )}
        </div>
    ))}

                            <Divider my="md"/>
                            <Group justify="space-between" mx="20">
                                <Button variant="subtle" size="sm" radius="lg" onClick={() => handleNavigate(id)}>
                                    <IconMessageCircle size={30}  style={{ color: '#002379' }} /> <Text  style={{ color: '#002379' }}  ml={4}>{post?.replies_count}</Text>
                                </Button>
                                <Button variant="subtle" size="sm" radius="lg" onClick={handleLike}
                                        style={{display: 'flex', alignItems: 'center'}}>
                                    {liked ? <IconHeartFilled size={30}  style={{ color: '#002379' }} /> : <IconHeart size={30}  style={{ color: '#002379' }} />} <Text
                                   style={{ color: '#002379' }}   ml={4}>{likeCount}</Text>
                                </Button>
                                <Button variant="subtle" size="sm" radius="lg" onClick={handleSave}
                                        style={{display: 'flex', alignItems: 'center'}}>
                                    {bookmarked ? <IconBookmarkFilled size={30}  style={{ color: '#002379' }} /> : <IconBookmark size={30} style={{ color: '#002379' }} />}
                                </Button>
                                <Button variant="subtle" size="sm" radius="lg" onClick={handleCopyLink}>
                                    <IconLink size={30}  style={{ color: '#002379' }} />
                                </Button>
                            </Group>
                        </Paper>
                       </div>
 

                    </div>
                    <Divider my="md"/>

                    <ReplySection
                        postId={id}
                        currentUser={currentUser}
                        fetchPostAndReplies={fetchPostAndReplies}
                    />

                    {replies.length > 0 && (
                        <div style={{display: 'flex', marginBottom: '0'}}>
                            {/* {tabColors.map((color, index) => (
                                <div
                                    key={index}
                                    onClick={() => handleTabClick(index)}
                                    style={{
                                        backgroundColor: color,
                                        padding: '10px 20px',
                                        cursor: 'pointer',
                                        borderRadius: index === 0 ? '8px 0 0 0' : index === tabColors.length - 1 ? '0 8px 0 0' : '0',
                                        textAlign: 'center',
                                        color: 'black',
                                        fontWeight: 'bold',
                                        flex: 1,
                                        margin: 0,
                                        border:'5px'
                                    }}
                                >
                                    {tabNames[index]}
                                </div>
                            ))} */}
                        </div>
                    )}

                    {replies.length > 0 && (
                        <Paper
                            style={{
                                borderRadius: '0 0 8px 8px',
                                fontFamily: 'Roboto, sans-serif',
                                fontSize: '14px',
                                marginTop: '3rem',
                                maxWidth: '100%',
                                width: '100%'
                            }}
                        >
                            <Tabs color = '#002379' defaultValue="time" orientation="vertical" inverted
                           value={activeTab}
                           onChange={handleTabChange}
                            >
                           <Tabs.List>
          <Tabs.Tab
            value="time"
            style={{
              fontWeight: activeTab === 'time' ? 'bold' : 'normal',
            }}
          >
            Time
          </Tabs.Tab>
          <Tabs.Tab
            value="recommended"
            style={{
              fontWeight: activeTab === 'recommended' ? 'bold' : 'normal',
            }}
          >
            Recommended
          </Tabs.Tab>
          <Tabs.Tab
            value="stacked"
            style={{
              fontWeight: activeTab === 'stacked' ? 'bold' : 'normal',
            }}
          >
            Stacked
          </Tabs.Tab>
          <Tabs.Tab
            value="summary"
            style={{
              fontWeight: activeTab === 'summary' ? 'bold' : 'normal',
            }}
          >
            Summary
          </Tabs.Tab>
        </Tabs.List>

                            <Tabs.Panel value="time">                                
                                <>
                                    {filteredReplies.slice(0, visibleReplies).map((reply) => renderReplies(reply))}
                                    {visibleReplies < filteredReplies.length && (
                                        <Button onClick={handleShowMoreReplies} variant="outline" fullWidth
                                                style={{marginTop: '10px'}}>
                                            {loadingMoreReplies ? 'Loading...' : 'More Replies'}
                                        </Button>
                                    )}
                                </>
                                </Tabs.Panel>
                            <Tabs.Panel value="recommended">
                            <div style={{textAlign: 'center'}}>
                                
                                    {recommendedLoading ? (
                                        <Loader size="lg"/>
                                    ) : (
                                        recommendedPosts.map((post) => renderRecommendedPosts(post))
                                    )}
                                </div>
                            </Tabs.Panel>
                            <Tabs.Panel value="stacked">                               
                                 <div style={{ textAlign: 'center' }}>
                                    {loadingRepliesStack ? (
                                        <Loader size="lg" />
                                    ) : (
                                        <RepliesStack
                                            repliesStacks={repliesStack}
                                            cardWidth={450}
                                            onStackClick={() => { }}
                                            setIsExpandModalOpen={() => { }}
                                            showupdate={true}
                                        />
                                    )}
                                </div>
                            </Tabs.Panel>
                            <Tabs.Panel value="summary">   
                                <div>
                                    {summary}
                                </div>
                            </Tabs.Panel>
                            </Tabs>
                            {/* {selectedTab === 0 && (
                                <>
                                    {filteredReplies.slice(0, visibleReplies).map((reply) => renderReplies(reply))}
                                    {visibleReplies < filteredReplies.length && (
                                        <Button onClick={handleShowMoreReplies} variant="outline" fullWidth
                                                style={{marginTop: '10px'}}>
                                            {loadingMoreReplies ? 'Loading...' : 'More Replies'}
                                        </Button>
                                    )}
                                </>
                            )}

                            {selectedTab === 1 && (
                                <div style={{textAlign: 'center'}}>
                                    {recommendedLoading ? (
                                        <Loader size="lg"/>
                                    ) : (
                                        recommendedPosts.map((post) => renderRecommendedPosts(post))
                                    )}
                                </div>
                            )}
                            {selectedTab === 2 && ( 
                                <div style={{ textAlign: 'center' }}>
                                    {loadingRepliesStack ? (
                                        <Loader size="lg" />
                                    ) : (
                                        <RepliesStack
                                            repliesStacks={repliesStack}
                                            cardWidth={450}
                                            onStackClick={() => { }}
                                            setIsExpandModalOpen={() => { }}
                                            showupdate={true}
                                        />
                                    )}
                                </div>
                            )}
                            {selectedTab === 3 && (
                                <div>
                                    {summary}
                                </div>

                            )} */}
                        </Paper>
                    )}
                    <div style={{height: '100vh'}}></div>
                </div>
                <div style={{gridColumn: '2 / 3'}}>

                    <div ref={relatedStacksRef} style={{position: 'relative'}}>


                        {
                            showFocusRelatedStacks &&
                            focus_relatedStacks.length > 0 && (
                                <AnimatePresence>
                                    {focuspostPosition && (
                                        <motion.div
                                            style={{
                                                position: 'absolute',
                                                top:focuspostPosition.top+90,
                                                left: 20,
                                                zIndex: 10
                                            }}
                                            initial={{opacity: 0, x: -200}}
                                            animate={{opacity: 1, x: 0}}
                                            exit={{opacity: 0, x: -200}}
                                            transition={{duration: 0.2}}
                                        >


                                            <RelatedStacks
                                                relatedStacks={focus_relatedStacks}
                                                cardWidth={450}
                                                onStackClick={() => {
                                                }}
                                                setIsExpandModalOpen={() => {
                                                }}
                                                showupdate={true}

                                            />
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            )
                        }
                        <AnimatePresence>
                            {!showFocusRelatedStacks &&
                                postPosition && (
                                    <motion.div
                                        style={{
                                            position: 'absolute',
                                            top: postPosition.top - 100,
                                            left: 20,
                                            zIndex: 10
                                        }}
                                        initial={{opacity: 0, x: -200}}
                                        animate={{opacity: 1, x: 0}}
                                        exit={{opacity: 0, x: -200}}
                                        transition={{duration: 0.2}}
                                    >
                                        <RelatedStacks
                                            relatedStacks={relatedStacks}
                                            cardWidth={450}
                                            onStackClick={() => {
                                            }}
                                            setIsExpandModalOpen={() => {
                                            }}
                                            showupdate={true}

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
