

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

// ─── Listy Injection mock data types ────────────────────────────────────────

export type CategoryKey =
  | 'agree'
  | 'disagree'
  | 'predictions'
  | 'evidence_public'
  | 'evidence_personal'
  | 'connections'
  | 'questions'
  | 'humor'
  | 'values'
  | 'framing'
  | 'proposals'
  | 'uncategorized';

export interface FocusPostMock {
  id: string;
  /** HTML string (Mastodon-style, e.g. <p>…</p>) used for default rendering */
  content: string;
  /** Plain text version of content – used as the base for focusHighlight parsing */
  plainText: string;
  account: {
    display_name: string;
    acct: string;
    avatar: string;
  };
  created_at: string;
  favourites_count: number;
  replies_count: number;
  favourited: boolean;
  bookmarked: boolean;
}

export interface RelatedPostMock {
  id: string;
  category: CategoryKey;
  /** Rank within category (1 = highest relevance) */
  rank: number;
  /** Global rank across all categories (1 = highest relevance) */
  globalRank: number;
  /** Plain text of the related post */
  content: string;
  /** content with ⌊bracket⌋ markers indicating the highlighted span */
  content_highlight: string;
  /**
   * The focus post's plainText with ⌊bracket⌋ markers indicating which
   * substring this post is responding to. Parsed by parseHighlight() to
   * drive cross-post highlighting in FocusPost.
   */
  focusHighlight: string;
  account: {
    display_name: string;
    acct: string;
    avatar: string;
  };
  created_at: string;
  favourites_count: number;
  replies_count: number;
  favourited: boolean;
  bookmarked: boolean;
  rewrite?: {
    content: string;
    significant: boolean;
  };
}

export interface ListyInjectionEntry {
  focusPost: FocusPostMock;
  relatedPosts: RelatedPostMock[];
  replies?: FocusPostMock[];
}

export type ListyInjectionData = ListyInjectionEntry[];
