"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  TextInput,
  rem,
  Box,
  Paper,
  Avatar,
  Text,
  Loader,
} from "@mantine/core";
import { IconHash, IconSearch } from "@tabler/icons-react";
import {
  getHashtagPosts,
  getSuggestedAccounts,
  getUserPosts,
  searchAccounts,
  searchPosts,
  useHydrated,
  type Account,
  type Post,
} from "../../utils/localStore";
import { useAccessToken } from "../../utils/useAccessToken";
import {
  fetchMastodonAccountStatuses,
  fetchMastodonHashtagTimeline,
  searchMastodon,
  RELATED_POSTS_API_URL,
  type MastodonSearchResults,
  type MastodonStatus,
} from "../../utils/mastodonApi";
import {
  getHashtagDefinition,
  searchKnownHashtags,
  type HashtagDefinition,
} from "../../data/hashtagCatalog";
import type { PreviewCardType, Relation } from "../../types/PostType";
import {
  normalizeSearchFilter,
  searchQueryForEntity,
  shouldShowSearchSection,
} from "../../utils/searchDiscovery.mjs";
import SearchPostFeed, { type SearchFeedPost } from "./SearchPostFeed";
import classes from "./SearchBar.module.css";

type SearchAccount = Account & { mastodonId?: string; origin: "local" | "mastodon" };
type SearchPost = Post & {
  origin: "local" | "mastodon";
  mastodonAccountId?: string;
  authorStats?: { posts?: number; followers?: number; following?: number };
  previewCard?: PreviewCardType | null;
};

type RelatedPayload = {
  relatedStacks: any[];
  stackCount: number;
  focusRelations: Relation[];
};

interface SearchHashtag extends HashtagDefinition {
  url?: string;
}

const EMPTY_REMOTE_RESULTS: MastodonSearchResults = {
  accounts: [],
  statuses: [],
  hashtags: [],
};

const relatedSearchCache = new Map<string, RelatedPayload>();

function focusRelationsFromStacks(stacks: any[]): Relation[] {
  return stacks.flatMap((stack) =>
    Array.isArray(stack?.topPost?.relations) ? stack.topPost.relations : [],
  );
}

type SearchFilter = "all" | "posts" | "hashtags" | "people";
type EntityFilter = {
  kind: "hashtag" | "person";
  value: string;
  accountId?: string;
  origin?: SearchAccount["origin"];
  apiValue?: string;
};

const SEARCH_FILTER_OPTIONS: Array<{ value: SearchFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "posts", label: "Posts" },
  { value: "hashtags", label: "Hashtags" },
  { value: "people", label: "People" },
];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text
      size="xs"
      fw={600}
      c="#435268"
      mb={8}
      style={{ fontSize: 13 }}
    >
      {children}
    </Text>
  );
}

function mastodonStatusToSearchPost(status: MastodonStatus): SearchPost {
  return {
    id: status.id,
    content: status.content,
    account: {
      username: status.account.display_name || status.account.username,
      acct: status.account.acct,
      avatar: status.account.avatar,
    },
    replies_count: status.replies_count,
    created_at: status.created_at,
    stackCount: null,
    favourites_count: status.favourites_count,
    favourited: status.favourited,
    bookmarked: status.bookmarked,
    media_attachments: status.media_attachments,
    relatedStacks: [],
    focusRelations: [],
    in_reply_to_id: typeof status.in_reply_to_id === "string" ? status.in_reply_to_id : null,
    mastodonAccountId: status.account.id,
    authorStats: {
      posts: Number(status.account.statuses_count ?? 0),
      followers: Number(status.account.followers_count ?? 0),
      following: Number(status.account.following_count ?? 0),
    },
    previewCard: status.card ? {
      title: status.card.title,
      description: status.card.description,
      image: status.card.image || undefined,
      url: status.card.url,
    } : null,
    origin: "mastodon",
  };
}

export default function SearchBar() {
  const hydrated = useHydrated();
  const { token, ready: authReady } = useAccessToken();

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [urlReady, setUrlReady] = useState(false);
  const [filter, setFilter] = useState<SearchFilter>("all");
  const [entityFilter, setEntityFilter] = useState<EntityFilter | null>(null);
  const [remoteResults, setRemoteResults] = useState(EMPTY_REMOTE_RESULTS);
  const [remoteEntityStatuses, setRemoteEntityStatuses] = useState<MastodonStatus[]>([]);
  const [entityLoading, setEntityLoading] = useState(false);
  const [entityError, setEntityError] = useState(false);
  const [remoteRelated, setRemoteRelated] = useState<Record<string, RelatedPayload>>({});
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState(false);

  // Search terms are first-class, shareable feed state. Hydrate from the URL
  // before writing back so a shared /search?q=Rubio link never flashes empty.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initial = params.get("q") ?? "";
    const initialFilter = normalizeSearchFilter(params.get("type")) as SearchFilter;
    const rawEntity = params.get("entity")?.trim() ?? "";
    setQuery(initial);
    setDebounced(initial);
    setFilter(initialFilter);
    if (rawEntity.startsWith("#") || rawEntity.startsWith("@")) {
      const entityValue = rawEntity.slice(1);
      const hashtagDefinition = rawEntity.startsWith("#")
        ? getHashtagDefinition(entityValue)
        : undefined;
      setFilter("posts");
      setEntityFilter({
        kind: rawEntity.startsWith("#") ? "hashtag" : "person",
        value: entityValue,
        apiValue: hashtagDefinition?.apiTag,
      });
    }
    setUrlReady(true);
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(timeout);
  }, [query]);

  const q = debounced.trim();

  useEffect(() => {
    if (!urlReady) return;
    const params = new URLSearchParams(window.location.search);
    if (q) params.set("q", q);
    else params.delete("q");
    if (filter === "all") params.delete("type");
    else params.set("type", filter);
    if (entityFilter) {
      params.set("entity", searchQueryForEntity(entityFilter.kind, entityFilter.value));
    } else {
      params.delete("entity");
    }
    const search = params.toString();
    const target = `${window.location.pathname}${search ? `?${search}` : ""}`;
    if (target !== window.location.pathname + window.location.search) {
      window.history.replaceState(window.history.state, "", target);
    }
  }, [entityFilter, filter, q, urlReady]);

  useEffect(() => {
    if (!authReady || !token || !q) {
      setRemoteResults(EMPTY_REMOTE_RESULTS);
      setRemoteLoading(false);
      setRemoteError(false);
      return;
    }

    const controller = new AbortController();
    setRemoteLoading(true);
    setRemoteError(false);
    searchMastodon(token, q, controller.signal)
      .then((results) => setRemoteResults(results))
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setRemoteResults(EMPTY_REMOTE_RESULTS);
        setRemoteError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setRemoteLoading(false);
      });
    return () => controller.abort();
  }, [authReady, q, token]);

  // Entity chips are a new query source, not a client-side narrowing of the
  // preceding text-search response. This guarantees that choosing a person or
  // hashtag can reveal posts that never contained the original query string.
  useEffect(() => {
    if (!entityFilter || !authReady) {
      setRemoteEntityStatuses([]);
      setEntityLoading(false);
      setEntityError(false);
      return;
    }

    if (entityFilter.kind === "person" && !entityFilter.accountId) {
      setRemoteEntityStatuses([]);
      setEntityLoading(false);
      setEntityError(false);
      return;
    }

    const controller = new AbortController();
    setEntityLoading(true);
    setEntityError(false);
    const request = entityFilter.kind === "person"
      ? fetchMastodonAccountStatuses(entityFilter.accountId!, token, controller.signal)
      : fetchMastodonHashtagTimeline(entityFilter.apiValue ?? entityFilter.value, token, controller.signal);
    request
      .then(setRemoteEntityStatuses)
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setRemoteEntityStatuses([]);
        setEntityError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setEntityLoading(false);
      });
    return () => controller.abort();
  }, [authReady, entityFilter, token]);

  const localUsers = useMemo(
    () => (hydrated && q ? searchAccounts(q).slice(0, 10) : []),
    [hydrated, q],
  );
  const suggestedUsers = useMemo(
    () => (hydrated ? getSuggestedAccounts(3) : []),
    [hydrated],
  );
  const localPosts = useMemo(
    () => (hydrated && q ? searchPosts(q) : []),
    [hydrated, q],
  );
  const localEntityPosts = useMemo(() => {
    if (!hydrated || !entityFilter) return [];
    return entityFilter.kind === "person"
      ? getUserPosts(entityFilter.value)
      : getHashtagPosts(entityFilter.value);
  }, [entityFilter, hydrated]);

  const users = useMemo<SearchAccount[]>(() => {
    const unique = new Map<string, SearchAccount>();
    for (const account of localUsers) {
      unique.set(account.acct.toLowerCase(), { ...account, origin: "local" });
    }
    for (const account of remoteResults.accounts) {
      const key = account.acct.toLowerCase();
      if (unique.has(key)) continue;
      unique.set(key, {
        acct: account.acct,
        display_name: account.display_name || account.username,
        username: account.username,
        avatar: account.avatar,
        followers_count: Number(account.followers_count ?? 0),
        following_count: Number(account.following_count ?? 0),
        statuses_count: Number(account.statuses_count ?? 0),
        note: typeof account.note === "string" ? account.note : "",
        mastodonId: account.id,
        origin: "mastodon",
      });
    }
    return Array.from(unique.values()).slice(0, 10);
  }, [localUsers, remoteResults.accounts]);

  // A shared person-filter URL stores the portable handle, not an instance-
  // specific account id. Resolve that id from the accompanying search result
  // before requesting the account's real status timeline.
  useEffect(() => {
    if (entityFilter?.kind !== "person" || entityFilter.accountId) return;
    const match = users.find(
      (account) => account.acct.toLowerCase() === entityFilter.value.toLowerCase(),
    );
    if (!match?.mastodonId) return;
    setEntityFilter((current) => current?.kind === "person"
      ? { ...current, accountId: match.mastodonId, origin: match.origin }
      : current);
  }, [entityFilter, users]);

  const posts = useMemo<SearchPost[]>(() => {
    const unique = new Map<string, SearchPost>();
    for (const post of localPosts) unique.set(post.id, { ...post, origin: "local" });
    for (const status of remoteResults.statuses) {
      if (unique.has(status.id)) continue;
      unique.set(status.id, mastodonStatusToSearchPost(status));
    }
    return Array.from(unique.values());
  }, [localPosts, remoteResults.statuses]);

  const entityPosts = useMemo<SearchPost[]>(() => {
    const unique = new Map<string, SearchPost>();
    for (const post of localEntityPosts) unique.set(post.id, { ...post, origin: "local" });
    for (const status of remoteEntityStatuses) {
      if (!unique.has(status.id)) unique.set(status.id, mastodonStatusToSearchPost(status));
    }
    return Array.from(unique.values());
  }, [localEntityPosts, remoteEntityStatuses]);

  const displayedPosts = entityFilter ? entityPosts : posts;

  // Results render immediately; optional CrossWeave relation metadata hydrates
  // progressively and is cached across query refinements/back navigation.
  useEffect(() => {
    const remoteIds = displayedPosts
      .filter((post) => post.origin === "mastodon")
      .map((post) => post.id);
    if (remoteIds.length === 0) return;

    const controller = new AbortController();
    let cancelled = false;
    const load = async () => {
      for (let index = 0; index < remoteIds.length; index += 3) {
        const batch = remoteIds.slice(index, index + 3);
        const payloads = await Promise.all(batch.map(async (id) => {
          const cached = relatedSearchCache.get(id);
          if (cached) return [id, cached] as const;
          try {
            const response = await fetch(
              `${RELATED_POSTS_API_URL}/stacks/${encodeURIComponent(id)}/related`,
              { signal: controller.signal },
            );
            if (!response.ok) throw new Error(`Related-post lookup failed (${response.status})`);
            const data = await response.json();
            const relatedStacks = Array.isArray(data?.relatedStacks) ? data.relatedStacks : [];
            const payload: RelatedPayload = {
              relatedStacks,
              stackCount: Number.isFinite(data?.size) ? data.size : relatedStacks.length,
              focusRelations: focusRelationsFromStacks(relatedStacks),
            };
            relatedSearchCache.set(id, payload);
            return [id, payload] as const;
          } catch (error) {
            if (controller.signal.aborted) return null;
            const payload: RelatedPayload = { relatedStacks: [], stackCount: 0, focusRelations: [] };
            relatedSearchCache.set(id, payload);
            return [id, payload] as const;
          }
        }));
        if (cancelled) return;
        setRemoteRelated((current) => {
          const next = { ...current };
          payloads.forEach((entry) => {
            if (entry) next[entry[0]] = entry[1];
          });
          return next;
        });
      }
    };
    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [displayedPosts]);

  const feedPosts = useMemo<SearchFeedPost[]>(() => displayedPosts.map((post): SearchFeedPost => {
    const related = post.origin === "mastodon" ? remoteRelated[post.id] : undefined;
    return {
      postId: post.id,
      text: post.content,
      author: post.account.username,
      account: post.account.acct,
      accountId: post.mastodonAccountId,
      authorStats: post.authorStats,
      avatar: post.account.avatar,
      replies: [],
      replies_count: post.replies_count,
      createdAt: post.created_at,
      stackCount: related?.stackCount ?? post.stackCount,
      favouritesCount: post.favourites_count,
      favourited: post.favourited,
      bookmarked: post.bookmarked,
      mediaAttachments: (post.media_attachments ?? []).map((attachment: any) =>
        typeof attachment === "string" ? attachment : attachment.url,
      ),
      relatedStacks: related?.relatedStacks ?? post.relatedStacks ?? [],
      focusRelations: related?.focusRelations ?? post.focusRelations ?? [],
      previewCard: post.previewCard ?? null,
      inReplyToId: post.in_reply_to_id ?? null,
      replyingToAccount: null,
      origin: post.origin,
    };
  }), [displayedPosts, remoteRelated]);

  const hashtags = useMemo<SearchHashtag[]>(() => {
    const unique = new Map<string, SearchHashtag>();
    for (const tag of searchKnownHashtags(q)) {
      unique.set(tag.name.toLowerCase(), tag);
    }
    for (const tag of remoteResults.hashtags) {
      const key = tag.name.toLowerCase();
      if (unique.has(key)) continue;
      unique.set(key, {
        name: tag.name,
        description: "",
        local: false,
        url: tag.url,
      });
    }
    return Array.from(unique.values()).slice(0, 8);
  }, [q, remoteResults.hashtags]);

  const filterByEntity = (next: EntityFilter) => {
    if (!q) {
      const entityQuery = searchQueryForEntity(next.kind, next.value);
      setQuery(entityQuery);
      setDebounced(entityQuery);
    }
    setEntityFilter(next);
    setFilter("posts");
  };

  const filteredFeedPosts = useMemo(() => {
    return feedPosts;
  }, [feedPosts]);

  const hasQuery = q.length > 0;
  const hasResults = hashtags.length > 0 || users.length > 0 || displayedPosts.length > 0;
  const visibleHasResults =
    (shouldShowSearchSection(filter, "posts") && filteredFeedPosts.length > 0) ||
    (shouldShowSearchSection(filter, "hashtags") && hashtags.length > 0) ||
    (shouldShowSearchSection(filter, "people") && users.length > 0);
  const entityLabel = entityFilter
    ? searchQueryForEntity(entityFilter.kind, entityFilter.value)
    : null;
  const entityFilterLabel = entityFilter?.kind === "hashtag"
    ? `Tagged ${entityLabel}`
    : `By ${entityLabel}`;

  return (
    <Box>
      <Paper p="md" mb="lg" className={classes.searchCard}>
        <TextInput
          placeholder="Search hashtags, people, and posts"
          variant="unstyled"
          value={query}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
            setEntityFilter(null);
          }}
          aria-label="Search hashtags, people, and posts"
          leftSection={<IconSearch style={{ width: rem(16), height: rem(16) }} />}
          rightSection={remoteLoading || entityLoading ? <Loader size={14} /> : undefined}
        />
      </Paper>

      {hasQuery && (
        <nav className={classes.filterBar} aria-label="Filter search results">
          {SEARCH_FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={classes.filterButton}
              data-active={filter === option.value}
              aria-pressed={filter === option.value}
              onClick={() => {
                setFilter(option.value);
                if (option.value !== "posts") setEntityFilter(null);
              }}
            >
              {option.label}
            </button>
          ))}
        </nav>
      )}

      {hasQuery && entityFilter && (
        <div
          className={classes.entityContext}
          aria-label={`Search context: ${entityFilterLabel}`}
        >
          <span className={classes.entityContextLabel}>Viewing</span>
          <span>{entityFilterLabel}</span>
        </div>
      )}

      {hydrated && (
        <>
          {!hasQuery && (
            <Box mb="lg">
              <SectionTitle>Top people and hashtags</SectionTitle>
              <div className={classes.discoveryGrid}>
                <DiscoveryColumn title="Hashtags">
                  {hashtags.slice(0, 3).map((tag) => (
                    <HashtagResult key={tag.name} tag={tag} compact onSelect={(selected) => filterByEntity({ kind: "hashtag", value: selected.name, apiValue: selected.apiTag ?? selected.name })} />
                  ))}
                </DiscoveryColumn>
                <DiscoveryColumn title="People">
                  {suggestedUsers.map((account) => (
                    <PersonResult
                      key={account.acct}
                      account={{ ...account, origin: "local" }}
                      onSelect={(selected) => filterByEntity({
                        kind: "person",
                        value: selected.acct,
                        accountId: selected.mastodonId,
                        origin: selected.origin,
                      })}
                    />
                  ))}
                </DiscoveryColumn>
              </div>
            </Box>
          )}

          {hasQuery && (!hasResults || !visibleHasResults) && !remoteLoading && !entityLoading && (
            <Text size="sm" c="dimmed" px="xs">
              {entityFilter
                ? `No posts found for ${entityLabel}.`
                : `No ${filter === "all" ? "results" : filter} for “${q}”.`}
            </Text>
          )}

          {hasQuery && (remoteError || entityError) && (
            <Text size="xs" c="dimmed" px="xs" mb="md" role="status">
              Server search is unavailable. Showing results saved in this app.
            </Text>
          )}

          {hasQuery && filter === "all" && (hashtags.length > 0 || users.length > 0) && (
            <Box mb="lg">
              <SectionTitle>Top people and hashtags</SectionTitle>
              <div
                className={classes.discoveryGrid}
                style={hashtags.length === 0 || users.length === 0 ? { gridTemplateColumns: "1fr" } : undefined}
              >
                {hashtags.length > 0 && (
                  <DiscoveryColumn title="Hashtags">
                    {hashtags.slice(0, 3).map((tag) => (
                      <HashtagResult
                        key={tag.name}
                        tag={tag}
                        compact
                        onSelect={(selected) => filterByEntity({ kind: "hashtag", value: selected.name, apiValue: selected.apiTag ?? selected.name })}
                      />
                    ))}
                  </DiscoveryColumn>
                )}
                {users.length > 0 && (
                  <DiscoveryColumn title="People">
                    {users.slice(0, 3).map((account) => (
                      <PersonResult
                        key={`${account.origin}:${account.acct}`}
                        account={account}
                        onSelect={(selected) => filterByEntity({
                          kind: "person",
                          value: selected.acct,
                          accountId: selected.mastodonId,
                          origin: selected.origin,
                        })}
                      />
                    ))}
                  </DiscoveryColumn>
                )}
              </div>
            </Box>
          )}

          {hasQuery && shouldShowSearchSection(filter, "posts") && filteredFeedPosts.length > 0 && (
            <Box mb="lg">
              <SectionTitle>Posts</SectionTitle>
              <SearchPostFeed
                posts={filteredFeedPosts}
                query={`${q}:${entityLabel ?? "all"}`}
              />
            </Box>
          )}

          {hasQuery && filter === "hashtags" && hashtags.length > 0 && (
            <Box mb="lg">
              <SectionTitle>Hashtags</SectionTitle>
              <div className={classes.fullResults}>
                {hashtags.map((tag) => (
                  <HashtagResult
                    key={tag.name}
                    tag={tag}
                    onSelect={(selected) => filterByEntity({ kind: "hashtag", value: selected.name, apiValue: selected.apiTag ?? selected.name })}
                  />
                ))}
              </div>
            </Box>
          )}

          {hasQuery && filter === "people" && users.length > 0 && (
            <Box mb="lg">
              <SectionTitle>People</SectionTitle>
              <div className={classes.fullResults}>
                {users.map((account) => (
                  <PersonResult
                    key={`${account.origin}:${account.acct}`}
                    account={account}
                    onSelect={(selected) => filterByEntity({
                      kind: "person",
                      value: selected.acct,
                      accountId: selected.mastodonId,
                      origin: selected.origin,
                    })}
                  />
                ))}
              </div>
            </Box>
          )}

        </>
      )}
    </Box>
  );
}

function DiscoveryColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={classes.discoveryColumn} aria-label={title}>
      <h3 className={classes.columnTitle}>{title}</h3>
      <div className={classes.entityList}>{children}</div>
    </section>
  );
}

function HashtagResult({
  tag,
  onSelect,
  compact = false,
}: {
  tag: SearchHashtag;
  onSelect: (tag: SearchHashtag) => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(tag)}
      className={classes.entityButton}
      aria-label={`Filter posts by #${tag.name}`}
    >
      <span className={classes.hashIcon} aria-hidden>
        <IconHash size={compact ? 14 : 16} stroke={2} />
      </span>
      <span className={classes.entityText}>#{tag.name}</span>
    </button>
  );
}

function PersonResult({
  account,
  onSelect,
}: {
  account: SearchAccount;
  onSelect: (account: SearchAccount) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(account)}
      className={classes.entityButton}
      aria-label={`Filter posts by @${account.acct}`}
      data-search-origin={account.origin}
    >
      <Avatar src={account.avatar} radius="xl" size={26} />
      <span className={classes.entityText}>
        {account.display_name}
        <span className={classes.entityHandle}>@{account.acct}</span>
      </span>
    </button>
  );
}
