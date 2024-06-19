import React, { useEffect, useState } from 'react';
import Post from './Post';
import { LoadingOverlay } from "@mantine/core";
import { PostType } from '../types/PostType';
import axios from 'axios';

const MastodonInstanceUrl = 'https://beta.stacky.social';
// const MastodonInstanceUrl = 'https://mastodon.social';

export default function Posts() {
    const [posts, setPosts] = useState<PostType[]>([]);
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem('accessToken');
        setAccessToken(token);

        const user = localStorage.getItem('currentUser');
        if (user) {
            setCurrentUser(JSON.parse(user));
        }
    }, []);

    useEffect(() => {
        const fetchPosts = async () => {
            try {
                const response = await axios.get(`${MastodonInstanceUrl}/api/v1/timelines/public?local=true`, {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    }
                });
                const data: PostType[] = response.data.map((post: any) => ({
                    postId: post.id,
                    text: post.content,
                    author: post.account.username,
                    avatar: post.account.avatar,
                    createdAt: post.created_at,
                    replies: [],
                    stackCount: null,
                    stackId: null,
                    favouritesCount: post.favourites_count,
                    favourited: post.favourited,
                    bookmarked: post.bookmarked
                }));

                setPosts(data);
                setLoading(false);

                data.forEach(async (post) => {
                    try {
                        const stackResponse = await axios.get(`${MastodonInstanceUrl}:3002/posts/${post.postId}/stack`);
                        const stackData = stackResponse.data;

                        if (stackData.stackId) {
                            console.log(`Successfully fetched stack data for post ${post.postId}:`, stackData);
                        }

                        setPosts((prevPosts) => prevPosts.map((p) =>
                            p.postId === post.postId ? { ...p, stackCount: stackData.size, stackId: stackData.stackId } : p
                        ));
                    } catch (error) {
                        console.error(`Error fetching stack data for post ${post.postId}:`, error);
                    }
                });
            } catch (error) {
                console.error('Error fetching Mastodon data:', error);
                setLoading(false);
            }
        };

        fetchPosts();
    }, [accessToken]);

    const postElements = posts.map((post: PostType) => (
        <Post
            key={post.postId}
            id={post.postId}
            text={post.text}
            author={post.author}
            avatar={post.avatar}
            repliesCount={post.replies.length}
            createdAt={post.createdAt}
            stackCount={post.stackCount}
            stackId={post.stackId}
            favouritesCount={post.favouritesCount}
            favourited={post.favourited}
            bookmarked={post.bookmarked}
        />
    ));

    return (
        <div style={{ width: '100%' }}>
            <LoadingOverlay visible={loading} zIndex={1000} overlayProps={{ radius: "sm", blur: 2 }} />
            {!loading && postElements}
        </div>
    );
}
