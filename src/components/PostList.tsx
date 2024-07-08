import React, { useEffect, useState } from 'react';
import { LoadingOverlay } from "@mantine/core";
import { PostType } from '../types/PostType';
import Post from './Posts/Post';
import axios from 'axios';

interface PostListProps {
    apiUrl: string;
    handleStackIconClick: (relatedStacks: any[], postId: string, position: { top: number, height: number }) => void;
    loadStackInfo: boolean;
    accessToken: string | null;
    setIsModalOpen: (isOpen: boolean) => void; 
    setIsExpandModalOpen: (isOpen: boolean) => void; 
   
}

const PostList: React.FC<PostListProps> = ({ apiUrl, handleStackIconClick, loadStackInfo, accessToken, setIsModalOpen, setIsExpandModalOpen}) => {
    const [posts, setPosts] = useState<PostType[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchPosts = async () => {
            try {
                const response = await axios.get(apiUrl, {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    }
                });
                let data: PostType[] = response.data.map((post: any) => ({
                    postId: post.id,
                    text: post.content,
                    author: post.account.username,
                    avatar: post.account.avatar,
                    createdAt: post.created_at,
                    replies: post.replies_count,
                    stackCount: null,
                    stackId: null,
                    favouritesCount: post.favourites_count,
                    favourited: post.favourited,
                    bookmarked: post.bookmarked,
                    mediaAttachments: post.media_attachments,
                }));

                setPosts(data);
                setLoading(false);

                if (loadStackInfo) {
                    await loadStackData(data);
                }
            } catch (error) {
                console.error('Error fetching Mastodon data:', error);
                setLoading(false);
            }
        };

        fetchPosts();
    }, [apiUrl, accessToken, loadStackInfo]);

    const loadStackData = async (posts: PostType[]) => {
        const updatedPosts = await Promise.all(posts.map(async (post) => {
            try {
                const stackData = {
                    size: Math.floor(Math.random() * 100),
                    stackId: `stack-${post.postId}`
                };

                return {
                    ...post,
                    stackCount: stackData.size,
                    stackId: stackData.stackId
                };
            } catch (error) {
                console.error(`Error fetching stack data for post ${post.postId}:`, error);
                return post;
            }
        }));

        setPosts(updatedPosts);
    };

    const postElements = posts.map((post: PostType) => (
        <Post
            key={post.postId}
            id={post.postId}
            text={post.text}
            author={post.author}
            avatar={post.avatar}
            repliesCount={post.replies_count}
            createdAt={post.createdAt}
            stackCount={post.stackCount}
            stackId={post.stackId}
            favouritesCount={post.favouritesCount}
            favourited={post.favourited}
            bookmarked={post.bookmarked}
            mediaAttachments={post.mediaAttachments}
            onStackIconClick={handleStackIconClick}
            setIsModalOpen={setIsModalOpen}
            setIsExpandModalOpen={setIsExpandModalOpen}
          
        />
    ));

    return (
        <div style={{ width: '100%' }}>
            <LoadingOverlay visible={loading} zIndex={1000} overlayProps={{ radius: "sm", blur: 2 }} />
            {!loading && postElements}
        </div>
    );
};

export default PostList;
