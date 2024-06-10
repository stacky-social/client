import React, { useEffect, useState } from 'react';
import Post from './Post';
import { LoadingOverlay } from "@mantine/core";
import { PostType } from '../types/PostType';
import axios from 'axios';

export default function Posts() {
    const [posts, setPosts] = useState<PostType[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchPosts = async () => {
            try {
                const response = await axios.get('https://mastodon.social/api/v1/timelines/public');
                const data: PostType[] = response.data.map((post: any) => ({
                    postId: post.id,
                    text: post.content,  
                    author: post.account.display_name,
                    avatar: post.account.avatar,
                    createdAt: post.created_at, 
                    replies: [],
                    stackCount: null, 
                    stackId: null 
                }));

                setPosts(data);
                setLoading(false);

                // Fetch stack data for each post
            //     data.forEach(async (post) => {
            //         try {
            //             const stackResponse = await axios.get(`http://beta.stacky.social:3002/posts/${post.postId}/stack`);
            //             const stackData = stackResponse.data;

            //             if (stackData.stackId) {
            //                 console.log(`Successfully fetched stack data for post ${post.postId}:`, stackData);
            //             }

            //             setPosts((prevPosts) => prevPosts.map((p) => 
            //                 p.postId === post.postId ? { ...p, stackCount: stackData.size, stackId: stackData.stackId } : p
            //             ));
            //         } catch (error) {
            //             console.error(`Error fetching stack data for post ${post.postId}:`, error);
            //         }
            //     });
            // }
            data.forEach((post) => {
                // Simulate fetching stack data
                const stackData = {
                    stackId: "fixedStackId",
                    size: 10
                };

                console.log(`Successfully fetched stack data for post ${post.postId}:`, stackData);

                setPosts((prevPosts) => prevPosts.map((p) => 
                    p.postId === post.postId ? { ...p, stackCount: stackData.size, stackId: stackData.stackId } : p
                ));
            });
        } catch (error) {
                console.error('Error fetching Mastodon data:', error);
                setLoading(false);
            }
        };

        fetchPosts();
    }, []);

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
        />
    ));

    return (
        <div style={{ position: 'relative', minHeight: '100px' }}>
            <LoadingOverlay visible={loading} zIndex={1000} overlayProps={{ radius: "sm", blur: 2 }} />
            {!loading && postElements}
        </div>
    );
}
