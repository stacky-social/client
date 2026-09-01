"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  TextInput,
  rem,
  Box,
  Paper,
  Text,
} from "@mantine/core";
import { IconHash, IconSearch } from "@tabler/icons-react";
import {
  getCuratedHashtags,
  getCuratedPostsByAccount,
  getCuratedPostsByHashtag,
  getCuratedSuggestedAccounts,
  searchCuratedAccounts,
  searchCuratedPosts,
  type CuratedSearchAccount,
  type CuratedSearchHashtag,
  type CuratedSearchPost,
} from "../../utils/curatedSearch";
import {
  normalizeSearchFilter,
  searchQueryForEntity,
  shouldShowSearchSection,
} from "../../utils/searchDiscovery.mjs";
import SearchPostFeed, { type SearchFeedPost } from "./SearchPostFeed";
import classes from "./SearchBar.module.css";
import ProfileAvatar from "../ProfileAvatar";

type SearchAccount = CuratedSearchAccount & { origin: "curated" };
type SearchPost = CuratedSearchPost & { origin: "curated" };
type SearchHashtag = CuratedSearchHashtag;

type SearchFilter = "all" | "posts" | "hashtags" | "people";
type EntityFilter = {
  kind: "hashtag" | "person";
  value: string;
};

interface PersistedSearchState {
  query: string;
  filter: SearchFilter;
  entityFilter: EntityFilter | null;
}

const SEARCH_STATE_KEY = "crossweave:curated-search:v1";

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

export default function SearchBar() {
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [urlReady, setUrlReady] = useState(false);
  const [filter, setFilter] = useState<SearchFilter>("all");
  const [entityFilter, setEntityFilter] = useState<EntityFilter | null>(null);
  const [scrollRequest, setScrollRequest] = useState(0);

  // A URL is authoritative when it carries search state. A plain /search
  // navigation restores the last session state, so leaving through the top nav
  // and returning does not discard the participant's query or result set.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hasUrlState = params.has("q") || params.has("type") || params.has("entity");
    let persisted: PersistedSearchState | null = null;
    if (!hasUrlState) {
      try {
        persisted = JSON.parse(sessionStorage.getItem(SEARCH_STATE_KEY) ?? "null") as PersistedSearchState | null;
      } catch {
        sessionStorage.removeItem(SEARCH_STATE_KEY);
      }
    }
    const initial = hasUrlState ? (params.get("q") ?? "") : (persisted?.query ?? "");
    const initialFilter = hasUrlState
      ? normalizeSearchFilter(params.get("type")) as SearchFilter
      : normalizeSearchFilter(persisted?.filter) as SearchFilter;
    const rawEntity = hasUrlState
      ? (params.get("entity")?.trim() ?? "")
      : persisted?.entityFilter
        ? searchQueryForEntity(persisted.entityFilter.kind, persisted.entityFilter.value)
        : "";
    const restoredEntity = rawEntity.startsWith("#") || rawEntity.startsWith("@")
      ? {
          kind: rawEntity.startsWith("#") ? "hashtag" as const : "person" as const,
          value: rawEntity.slice(1),
        }
      : null;
    setQuery(initial);
    setDebounced(initial);
    setFilter(restoredEntity ? "posts" : initialFilter);
    setEntityFilter(restoredEntity);
    setHydrated(true);
    setUrlReady(true);
  }, []);

  useEffect(() => {
    if (!urlReady) return;
    sessionStorage.setItem(SEARCH_STATE_KEY, JSON.stringify({ query, filter, entityFilter }));
  }, [entityFilter, filter, query, urlReady]);

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

  const users = useMemo<SearchAccount[]>(() => (
    hydrated && q
      ? searchCuratedAccounts(q).map((account) => ({ ...account, origin: "curated" }))
      : []
  ), [hydrated, q]);
  const suggestedUsers = useMemo<SearchAccount[]>(() => (
    hydrated
      ? getCuratedSuggestedAccounts(3).map((account) => ({ ...account, origin: "curated" }))
      : []
  ), [hydrated]);
  const posts = useMemo<SearchPost[]>(() => (
    hydrated && q
      ? searchCuratedPosts(q).map((post) => ({ ...post, origin: "curated" }))
      : []
  ), [hydrated, q]);
  const entityPosts = useMemo<SearchPost[]>(() => {
    if (!hydrated || !entityFilter) return [];
    const records = entityFilter.kind === "person"
      ? getCuratedPostsByAccount(entityFilter.value)
      : getCuratedPostsByHashtag(entityFilter.value);
    return records.map((post) => ({ ...post, origin: "curated" }));
  }, [entityFilter, hydrated]);
  const displayedPosts = entityFilter ? entityPosts : posts;

  const feedPosts = useMemo<SearchFeedPost[]>(() => displayedPosts.map((post): SearchFeedPost => ({
    postId: post.id,
    text: post.content,
    author: post.account.username,
    account: post.account.acct,
    authorStats: {
      posts: users.find((account) => account.acct === post.account.acct)?.statuses_count,
      followers: 0,
      following: 0,
    },
    avatar: post.account.avatar,
    replies: [],
    replies_count: post.replies_count,
    createdAt: post.created_at,
    stackCount: post.stackCount,
    favouritesCount: post.favourites_count,
    favourited: post.favourited,
    bookmarked: post.bookmarked,
    mediaAttachments: [],
    relatedStacks: post.relatedStacks,
    focusRelations: post.focusRelations,
    previewCard: post.previewCard ?? null,
    quotedPost: post.quotedPost ?? null,
    inReplyToId: post.in_reply_to_id ?? null,
    replyingToAccount: null,
    origin: post.origin,
  })), [displayedPosts, users]);

  const hashtags = useMemo<SearchHashtag[]>(() => (
    hydrated ? getCuratedHashtags(q).slice(0, 8) : []
  ), [hydrated, q]);

  const filterByEntity = (next: EntityFilter) => {
    if (!q) {
      const entityQuery = searchQueryForEntity(next.kind, next.value);
      setQuery(entityQuery);
      setDebounced(entityQuery);
    }
    setEntityFilter(next);
    setFilter("posts");
    setScrollRequest((current) => current + 1);
  };

  const hasQuery = q.length > 0;
  const hasResults = hashtags.length > 0 || users.length > 0 || displayedPosts.length > 0;
  const visibleHasResults =
    (shouldShowSearchSection(filter, "posts") && feedPosts.length > 0) ||
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
            setScrollRequest((current) => current + 1);
          }}
          aria-label="Search hashtags, people, and posts"
          leftSection={<IconSearch style={{ width: rem(16), height: rem(16) }} />}
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
                    <HashtagResult key={tag.name} tag={tag} compact onSelect={(selected) => filterByEntity({ kind: "hashtag", value: selected.name })} />
                  ))}
                </DiscoveryColumn>
                <DiscoveryColumn title="People">
                  {suggestedUsers.map((account) => (
                    <PersonResult
                      key={account.acct}
                      account={account}
                      onSelect={(selected) => filterByEntity({
                        kind: "person",
                        value: selected.acct,
                      })}
                    />
                  ))}
                </DiscoveryColumn>
              </div>
            </Box>
          )}

          {hasQuery && (!hasResults || !visibleHasResults) && (
            <Text size="sm" c="dimmed" px="xs">
              {entityFilter
                ? `No posts found for ${entityLabel}.`
                : `No ${filter === "all" ? "results" : filter} for “${q}”.`}
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
                        onSelect={(selected) => filterByEntity({ kind: "hashtag", value: selected.name })}
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
                        })}
                      />
                    ))}
                  </DiscoveryColumn>
                )}
              </div>
            </Box>
          )}

          {hasQuery && shouldShowSearchSection(filter, "posts") && feedPosts.length > 0 && (
            <Box mb="lg">
              <SectionTitle>Posts</SectionTitle>
              <SearchPostFeed
                posts={feedPosts}
                query={q}
                surfaceKey={`${q}:${entityLabel ?? "all"}`}
                scrollRequest={scrollRequest}
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
                    onSelect={(selected) => filterByEntity({ kind: "hashtag", value: selected.name })}
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
      <ProfileAvatar src={account.avatar} alt={account.display_name || account.username} radius="xl" size={26} />
      <span className={classes.entityText}>
        {account.display_name}
        <span className={classes.entityHandle}>@{account.acct}</span>
      </span>
    </button>
  );
}
