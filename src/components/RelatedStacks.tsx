import React from 'react';
import Post from './Post';
import { PostType } from '../types/PostType'; 

interface RelatedStacksProps {
    relatedStacks: { rel: string; 
        stackId: string,
        size: number,
        topPost: PostType }[];
    handleNavigate: (postId: string) => void;
}

const RelatedStacks: React.FC<RelatedStacksProps> = ({ relatedStacks, handleNavigate }) => {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', margin: '2rem' }}>
            {relatedStacks.map((stack, index) => (
                <Post
                    key={index}
                    id={stack.topPost.postId}
                    text={stack.topPost.text}
                    author={stack.topPost.author}
                    avatar={stack.topPost.avatar}
                    repliesCount={stack.topPost.replies.length}
                    createdAt={stack.topPost.createdAt}
                    stackCount={stack.size}
                    stackId={stack.stackId}
                    favouritesCount={stack.topPost.favouritesCount}
                    favourited={stack.topPost.favourited}
                    bookmarked={stack.topPost.bookmarked}
                />
            ))}
        </div>
    );
};

export default RelatedStacks;
