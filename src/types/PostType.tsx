

export interface ReplyType {
    postId: string;
    text: string;
    author: string;
    avatar: string;
    replies?: ReplyType[];
}

export interface PreviewCardType {
    title: string;
    description: string;
    image?: string;
    url: string;
}

export interface PostType {
    postId: string;
    text: string;
    author: string;
    account: string;
    avatar: string;
    replies: any[];
    createdAt: string;
    favouritesCount: number;
    favourited: boolean; 
    bookmarked: boolean;
    stackCount: number | null; 

    mediaAttachments: string[];
    replies_count: number;
    relatedStacks: any[];
    previewCard?: PreviewCardType | null;
}
