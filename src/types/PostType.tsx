

export interface ReplyType {
    postId: string;
    text: string;
    author: string;
    avatar: string;
    replies?: ReplyType[];
}

export interface PostType {
    postId: string;
    text: string;
    author: string;
    avatar: string;
    replies: any[];
    createdAt: string;
    favouritesCount: number;
    favourited: boolean; 
    bookmarked: boolean;
    stackCount: number | null; 
    stackId: string | null;
    mediaAttachments: string[];
}
