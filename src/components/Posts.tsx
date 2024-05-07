import React, { useEffect, useState } from 'react';
import Post from './Post';
import FakePosts from '../app/FakeData/FakePosts';
import { LoadingOverlay } from "@mantine/core";
import { PostType } from '../types/PostType';

export default function Posts() {
    const [posts, setPosts] = useState<PostType[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setPosts(FakePosts);  // Assume FakePosts now includes nested replies
        console.log(FakePosts);
        setLoading(false);
    }, []);

    const postElements = posts.map(post => (
        <Post key={post.postId} id={post.postId} text={post.text} author={post.author} avatar={post.avatar} repliesCount = {post.replies.length}/>
    ));

    return (
        <div style={{ position: 'relative', minHeight: '100px' }}>
            <LoadingOverlay visible={loading} zIndex={1000} overlayProps={{ radius: "sm", blur: 2 }} />
            {!loading && postElements}
        </div>
    );
}
