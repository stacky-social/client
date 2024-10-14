import React, { useEffect, useState, useRef } from 'react';
import { LoadingOverlay } from "@mantine/core";
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
    showLoadMore?: boolean;  // 控制是否显示“加载更多”
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
    showLoadMore = false  // 默认不显示“加载更多”
}) => {
    const [posts, setPosts] = useState<PostType[]>([]);
    const [loading, setLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [maxId, setMaxId] = useState<string | null>(null); // 用于分页
    const [hasMorePosts, setHasMorePosts] = useState(true);  // 控制是否还有更多帖子
    const postRefs = useRef<Array<HTMLDivElement | null>>([]);

    console.log('show more:', showLoadMore);

    useEffect(() => {
        const fetchPosts = async () => {
            setLoading(true);
            try {
                const response = await axios.get(apiUrl, {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                    params: {
                        limit: 40,
                        max_id: maxId || undefined,  // 如果是加载更多，则传入 max_id
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
                    relatedStacks: []
                }));

                setPosts(prevPosts => [...prevPosts, ...data]);  // 合并新旧帖子
                if (data.length > 0) {
                    setMaxId(data[data.length - 1].postId);  // 更新 max_id
                } else {
                    setHasMorePosts(false);  // 如果没有更多帖子，停止加载
                }
            } catch (error) {
                console.error('Error fetching Mastodon data:', error);
            } finally {
                setLoading(false);
                setIsLoadingMore(false);
            }
        };

        fetchPosts();
    }, [apiUrl, accessToken, loadStackInfo]);

    // 处理滚动条滚动逻辑
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

    // 加载更多帖子
    const handleLoadMore = async () => {
        setIsLoadingMore(true);
        try {
            const response = await axios.get(apiUrl, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
                params: {
                    limit: 40,
                    max_id: maxId || undefined  // 使用 max_id 分页
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
                relatedStacks: []
            }));

            setPosts((prevPosts) => [...prevPosts, ...data]); // 追加新数据
            if (data.length > 0) {
                setMaxId(data[data.length - 1].postId);  // 更新 max_id
            } else {
                setHasMorePosts(false);  // 如果没有更多帖子
            }
        } catch (error) {
            console.error('Error loading more posts:', error);
        } finally {
            setIsLoadingMore(false);
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
            />
        </div>
    ));

    return (
        <div style={{ width: '100%' }}>
            <LoadingOverlay visible={loading} zIndex={1000} overlayProps={{ radius: "sm", blur: 2 }} />
            {!loading && postElements}

            {showLoadMore && hasMorePosts && (
                <div style={{ textAlign: 'center', marginTop: '20px' }}>
                    <button onClick={handleLoadMore} disabled={isLoadingMore}>
                        {isLoadingMore ? 'Loading...' : 'Load More'}
                    </button>
                </div>
            )}
            {!hasMorePosts && (
                <div style={{ textAlign: 'center', marginTop: '20px' }}>
                    <p>No more posts to load.</p>
                </div>
            )}
        </div>
    );
};

export default PostList;
