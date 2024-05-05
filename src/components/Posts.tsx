import React from 'react';
import Post from './Post';
import {FakePosts} from '../app/FakeData/FakePosts';

export default function Posts() {
    // Map over the FakePosts array to render Post components
    const posts = FakePosts.map(post => <Post key={post.postId} id={post.postId} text={post.text} />);

    return (
        <div>
            {posts}
        </div>
    );
}
