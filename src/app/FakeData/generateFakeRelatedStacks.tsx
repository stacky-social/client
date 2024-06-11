import { PostType } from '../../types/PostType';

export const generateFakePost = (id: string): PostType => ({
    postId: id,
    text: 'This is a sample post content.',
    author: `author_${id}`,
    avatar: 'https://via.placeholder.com/150',
    replies: [],
    createdAt: new Date().toISOString(),
    favouritesCount: Math.floor(Math.random() * 100),
    favourited: Math.random() > 0.5,
    bookmarked: Math.random() > 0.5,
    stackCount: null,
    stackId: null
});

export const generateFakeRelatedStacks = (count: number) => {
    const relatedStacks = [];
    for (let i = 1; i <= count; i++) {
        relatedStacks.push({
            rel: `relation_${i}`,
            stackId: `stack_${i}`,
            size: Math.floor(Math.random() * 100),
            topPost: generateFakePost(`post_${i}`)
        });
    }
    return relatedStacks;
};
