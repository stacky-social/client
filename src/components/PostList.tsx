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
}) => {
    const [posts, setPosts] = useState<PostType[]>([]);
    const [loading, setLoading] = useState(true);
    const postRefs = useRef<Array<HTMLDivElement | null>>([]);


    useEffect(() => {
        const fetchPosts = async () => {
            try {
                console.log('Fetching posts from:', apiUrl);
                const response = await axios.get(apiUrl, {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    }
                });
                let data: PostType[] = response.data.map((post: any) => ({
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

                setPosts(data);
                setLoading(false);

                if (loadStackInfo) {
                    await loadStackDataInBatches(data, 2); 
                }
            } catch (error) {
                console.error('Error fetching Mastodon data:', error);
                setLoading(false);
            }
        };

        fetchPosts();
    }, [apiUrl, accessToken, loadStackInfo]);

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

    const loadStackDataInBatches = async (posts: PostType[], batchSize: number) => {
        for (let i = 0; i < posts.length; i += batchSize) {
            const batch = posts.slice(i, i + batchSize);
            await Promise.all(batch.map(async (post) => {
                try {
                    console.log('Fetching stack data for post:', post.postId);
                    const response = await axios.get(`${MastodonInstanceUrl}/stacks/${post.postId}/related_fake`, {
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                        }
                    });
                    console.log("id:", post.postId);
                    console.log('Stack data:', response.data);
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
            />
        </div>
    ));

    return (
        <div style={{ width: '100%' }}>
            <LoadingOverlay visible={loading} zIndex={1000} overlayProps={{ radius: "sm", blur: 2 }} />
            {!loading && postElements}
        </div>
    );
};

export default PostList;
