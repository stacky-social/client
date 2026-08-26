

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

export interface AuthorStats {
    posts?: number;
    followers?: number;
    following?: number;
}

/** Compact embedded source shown inside a lifted quote-tweet root. */
export interface QuotedPostMock {
  id: string;
  title?: string;
  content: string;
  account: {
    display_name: string;
    acct: string;
    avatar: string;
  };
  created_at: string;
  url?: string;
}

export interface PostType {
    postId: string;
    text: string;
    author: string;
    account: string;
    /** Stable Mastodon account id, when the status came from the live API. */
    accountId?: string;
    /** Account activity shown in the username hover tooltip when supplied by the source API. */
    authorStats?: AuthorStats;
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
    /** Embedded source on a lifted quote-tweet root. */
    quotedPost?: QuotedPostMock | null;
    /** Thread parent supplied by the timeline/status payload. */
    inReplyToId?: string | null;
    /** Parent account handle, resolved by the data adapter for X-style reply context. */
    replyingToAccount?: string | null;
    /** Offset annotations connecting this post to its related responses. */
    focusRelations?: Relation[];
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
  | 'pointers'
  | 'uncategorized';

/** A single relation between a substring in the focus post and a substring in the related post. */
export interface Relation {
  /** Highlighted range on the focus post's plainText */
  focusStart: number;
  focusEnd: number;
  /** Highlighted range on the related post's content */
  contentStart: number;
  contentEnd: number;
  /** Comment (key phrase to bold) — offsets within the focus post's plainText */
  focusCommentStart: number;
  focusCommentEnd: number;
  /** Comment (key phrase to bold) — offsets within the related post's content */
  contentCommentStart: number;
  contentCommentEnd: number;
  /** Relation type for this specific substring pair */
  category: CategoryKey;
  /** Short topic label from NLP, e.g. "Trial results". Optional — synthesized via topicOf() when missing. */
  topic?: string;
}

export interface FocusPostMock {
  id: string;
  /** Stable corpus join key retained for provenance/debugging. */
  sourceKey?: string;
  /** ID of the post this is a comment to (inherent thread hierarchy). Null/absent = root post. */
  inReplyToId?: string | null;
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
  /** Source article reachable from this post's thread, when available. */
  previewCard?: PreviewCardType | null;
  /** Embedded article/OP for a corpus quote-tweet root. */
  quotedPost?: QuotedPostMock | null;
}

export interface RelatedPostMock {
  id: string;
  /** Stable corpus join key retained for provenance/debugging. */
  sourceKey?: string;
  /** ID of the post this is a comment to (inherent thread hierarchy). Null/absent = root post. */
  inReplyToId?: string | null;
  category: CategoryKey;
  /** Rank within category (1 = highest relevance) */
  rank: number;
  /** Global rank across all categories (1 = highest relevance) */
  globalRank: number;
  /** Plain text of the related post */
  content: string;
  /** Relations: explicit offset-based substring pairs between focus and related post */
  relations: Relation[];
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
  /** Source article reachable from this post's thread, when available. */
  previewCard?: PreviewCardType | null;
  quotedPost?: QuotedPostMock | null;
  rewrite?: {
    content: string;
    significant: boolean;
    /** Authored text before backend decontextualization. */
    originalContent?: string;
    /** Plain-language reason the contextual edit was made. */
    editSummary?: string;
  };
}

/** A reply in the thread. Extends the base post shape with optional NLP output. */
export interface ReplyMock extends FocusPostMock {
  /**
   * Offset-based relations mirroring RelatedPostMock: `content*` offsets index
   * THIS reply's plainText, `focus*` offsets index the parent entry's
   * focusPost.plainText. Absent/empty = a reply with no contributions
   * (e.g. "me too"), which renders plain.
   */
  relations?: Relation[];
  /** Quality/diversity rank for the Top reply tab (1 = best). Optional. */
  rank?: number;
}

export interface ListyInjectionEntry {
  /** Prepared-data topic directory that produced this entry. */
  topicId?: string;
  /** True only for roots in corpus_threads.threads (the actual main timeline). */
  timelineRoot?: boolean;
  focusPost: FocusPostMock;
  relatedPosts: RelatedPostMock[];
  /**
   * Optional oldest-first chain of ancestor posts. `ancestors[ancestors.length - 1]`
   * is the immediate parent of `focusPost`. See LISTY-INJECTION-SCHEMA.md.
   */
  ancestors?: FocusPostMock[];
  replies?: ReplyMock[];
}

export type ListyInjectionData = ListyInjectionEntry[];
