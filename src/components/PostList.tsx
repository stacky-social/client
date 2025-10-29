import React, { useEffect, useState, useRef } from 'react';
import { LoadingOverlay, Button, Box } from "@mantine/core";
import { PostType } from '../types/PostType';
import Post from './Posts/Post';
import axios from 'axios';

const MastodonInstanceUrl = 'https://beta.stacky.social:3002';

interface PostListProps {
    apiUrl: string;
    handleStackIconClick: (relatedStacks: any[], postId: string, position: { top: number, height: number }) => void;
    loadStackInfo: boolean;
    accessToken: string | null;
    setIsModalOpen: (isOpen: boolean) => void;
    setIsExpandModalOpen: (isOpen: boolean) => void;
    activePostId: string | null;
    setActivePostId: (id: string | null) => void;
    showLoadMore?: boolean;
    
}

const PostList: React.FC<PostListProps> = ({
    apiUrl,
    handleStackIconClick,
    loadStackInfo,
    accessToken,
    setIsModalOpen,
    setIsExpandModalOpen,
    activePostId,
    setActivePostId,
    showLoadMore = false,
}) => {
    const [posts, setPosts] = useState<PostType[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const postRefs = useRef<Array<HTMLDivElement | null>>([]);
    const [maxId, setMaxId] = useState<string | null>(null);
    const hasAutoHighlightedFirstPostRef = useRef(false);

    useEffect(() => {
        fetchPosts();
    }, [apiUrl, accessToken, loadStackInfo]);

    const fetchPosts = async (isLoadMore = false) => {
        try {
            if (isLoadMore) {
                setLoadingMore(true);
            } else {
                setLoading(true);
            }

            const response = await axios.get(apiUrl, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
                params: {
                    limit: 40,
                    ...(maxId && { max_id: maxId }) // 如果有 maxId 就加上 max_id 参数
                }
            });

            const data: PostType[] = response.data.map((post: any) => ({
                postId: post.id,
                text: post.content,
                author: post.account.username,
                account: post.account.acct,
                avatar: post.account.avatar,
                createdAt: post.created_at,
                replies: post.replies_count,
                stackCount: loadStackInfo ? null : -1,
                favouritesCount: post.favourites_count,
                favourited: post.favourited,
                bookmarked: post.bookmarked,
                mediaAttachments: post.media_attachments,
                relatedStacks: [],
                previewCard: post.card ? {
                    title: post.card.title,
                    description: post.card.description,
                    image: post.card.image || undefined,
                    url: post.card.url,
                } : null
            }));

            setPosts((prevPosts) => isLoadMore ? [...prevPosts, ...data] : data);
            setMaxId(data[data.length - 1].postId);

            if (loadStackInfo) {
                await loadStackDataInBatches(data, 2); 
            }
        } catch (error) {
            console.error('Error fetching Mastodon data:', error);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    const handleLoadMore = () => {
        fetchPosts(true);
    };

    useEffect(() => {
        const handleScroll = () => {
            let found = false;
            for (let i = 0; i < postRefs.current.length; i++) {
                const ref = postRefs.current[i];
                if (ref && ref.getBoundingClientRect().top >= 0 && ref.getBoundingClientRect().bottom <= window.innerHeight) {
                    const post = posts[i];
                    if (post && post.postId !== activePostId) {
                        setActivePostId(post.postId);
                        const position = ref.getBoundingClientRect();
                        const adjustedPosition = { top: position.top + window.scrollY, height: position.height };
                        handleStackIconClick(post.relatedStacks, post.postId, adjustedPosition);
                    }
                    found = true;
                    break;
                }
            }
            if (!found) {
                setActivePostId(null);
            }
        };

        window.addEventListener('scroll', handleScroll);

        return () => {
            window.removeEventListener('scroll', handleScroll);
        };
    }, [posts, activePostId, handleStackIconClick, setActivePostId]);

    // Auto-highlight the first post once on initial page load only,
    // and wait until related stacks info is available when loadStackInfo is true
    useEffect(() => {
        if (hasAutoHighlightedFirstPostRef.current || posts.length === 0 || activePostId) return;

        const firstPost = posts[0];
        if (loadStackInfo) {
            // When loading stack info, wait until the first post's stackCount is resolved (null -> number)
            if (firstPost.stackCount === null) return;
        }

        const firstRef = postRefs.current[0];
        const rect = firstRef
            ? firstRef.getBoundingClientRect()
            : ({ top: 0, height: 0 } as { top: number; height: number });
        const adjustedPosition = { top: rect.top + window.scrollY, height: rect.height };

        setActivePostId(firstPost.postId);
        handleStackIconClick(firstPost.relatedStacks, firstPost.postId, adjustedPosition);
        hasAutoHighlightedFirstPostRef.current = true;
    }, [posts, activePostId, handleStackIconClick, setActivePostId, loadStackInfo]);

    const loadStackDataInBatches = async (posts: PostType[], batchSize: number) => {
        for (let i = 0; i < posts.length; i += batchSize) {
            const batch = posts.slice(i, i + batchSize);
            await Promise.all(batch.map(async (post) => {
                try {
                    console.log('Fetching stack data for post:', post.postId);
                    const response = await axios.get(`${MastodonInstanceUrl}/stacks/${post.postId}/related`, {
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                        }
                    });
                    const stackData = response.data.relatedStacks || [];
                    const stackCount = response.data.size;
                    setPosts((prevPosts) =>
                        prevPosts.map((p) =>
                            p.postId === post.postId
                                ? { ...p, stackCount: stackCount, relatedStacks: stackData }
                                : p
                        )
                    );
                } catch (error) {
                    console.error(`Error fetching stack data for post ${post.postId}:`, error);
                }
            }));
        }
    };

    const postElements = posts.map((post: PostType, index) => (
        <div
            key={post.postId}
            ref={(el) => {
                postRefs.current[index] = el;
            }}
        >
            <Post
                id={post.postId}
                text={post.text}
                author={post.author}
                account={post.account}
                avatar={post.avatar}
                repliesCount={post.replies_count}
                createdAt={post.createdAt}
                stackCount={post.stackCount}
                favouritesCount={post.favouritesCount}
                favourited={post.favourited}
                bookmarked={post.bookmarked}
                mediaAttachments={post.mediaAttachments}
                onStackIconClick={handleStackIconClick}
                setIsModalOpen={setIsModalOpen}
                setIsExpandModalOpen={setIsExpandModalOpen}
                relatedStacks={post.relatedStacks}
                activePostId={activePostId}
                setActivePostId={setActivePostId}
                initialCard={post.previewCard || null}
            />
        </div>
    ));

    return (
        <Box style={{ width: '100%', position: 'relative', minHeight: 80 }}>
            <LoadingOverlay visible={loading} overlayProps={{ radius: "sm", blur: 2 }} />
            {!loading && postElements}


            {showLoadMore && !loading && ( 
                <div style={{ textAlign: 'center', marginTop: '20px' }}>
                    <Button onClick={handleLoadMore} disabled={loadingMore}
                    style={{ backgroundColor: '#324e93', color: '#fff' }}>
                        {loadingMore ? 'Loading' : 'Load more'}
                    </Button>
                </div>
            )}
        </Box>
    );
};

export default PostList;
