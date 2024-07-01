"use client";
import React, { useEffect, useState } from 'react';
import Post from './Post';
import { LoadingOverlay } from "@mantine/core";
import { PostType } from '../../types/PostType';
import axios from 'axios';

export default function Posts({ apiUrl, loadStackInfo }: { apiUrl: string, loadStackInfo: boolean }) {
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
                const stackResponse = await axios.get(`https://beta.stacky.social:3002/posts/${post.postId}/stack`);
                const stackData = stackResponse.data;

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
        />
    ));

    return (
        <div style={{ width: '100%' }}>
            <LoadingOverlay visible={loading} zIndex={1000} overlayProps={{ radius: "sm", blur: 2 }} />
            {!loading && postElements}
        </div>
    );
}
