"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  TextInput,
  rem,
  Box,
  Paper,
  Avatar,
  UnstyledButton,
  Group,
  Text,
  Stack,
  Loader,
} from "@mantine/core";
import { IconHash, IconSearch } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import {
  searchAccounts,
  searchPosts,
  useHydrated,
  type Account,
  type Post,
} from "../../utils/localStore";
import { useAccessToken } from "../../utils/useAccessToken";
import {
  searchMastodon,
  type MastodonSearchResults,
} from "../../utils/mastodonApi";
import {
  searchKnownHashtags,
  type HashtagDefinition,
} from "../../data/hashtagCatalog";
import { normalizeMastodonText } from "../../utils/mastodonContent.mjs";

type SearchAccount = Account & { mastodonId?: string; origin: "local" | "mastodon" };
type SearchPost = Post & { origin: "local" | "mastodon" };

interface SearchHashtag extends HashtagDefinition {
  url?: string;
}

const EMPTY_REMOTE_RESULTS: MastodonSearchResults = {
  accounts: [],
  statuses: [],
  hashtags: [],
};

/** Truncate a string to `max` characters with an ellipsis. */
function snippet(text: string, max = 140): string {
  const clean = normalizeMastodonText(text);
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean;
}

const CARD_STYLE: React.CSSProperties = {
  backgroundColor: "#fff",
  border: "1px solid #aebdca",
  boxShadow: "0 4px 14px rgba(28, 43, 74, 0.08)",
  borderRadius: 8,
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text
      size="xs"
      fw={600}
      c="dimmed"
      mb="sm"
      px="xs"
      style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}
    >
      {children}
    </Text>
  );
}

export default function SearchBar() {
  const router = useRouter();
  const hydrated = useHydrated();
  const { token, ready: authReady } = useAccessToken();

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [remoteResults, setRemoteResults] = useState(EMPTY_REMOTE_RESULTS);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(timeout);
  }, [query]);

  const q = debounced.trim();

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

  const localUsers = useMemo(
    () => (hydrated && q ? searchAccounts(q).slice(0, 10) : []),
    [hydrated, q],
  );
  const localPosts = useMemo(
    () => (hydrated && q ? searchPosts(q).slice(0, 10) : []),
    [hydrated, q],
  );

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

  const posts = useMemo<SearchPost[]>(() => {
    const unique = new Map<string, SearchPost>();
    for (const post of localPosts) unique.set(post.id, { ...post, origin: "local" });
    for (const status of remoteResults.statuses) {
      if (unique.has(status.id)) continue;
      unique.set(status.id, {
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
        origin: "mastodon",
      });
    }
    return Array.from(unique.values()).slice(0, 12);
  }, [localPosts, remoteResults.statuses]);

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
        description: `Posts and conversations about #${tag.name}`,
        local: false,
        url: tag.url,
      });
    }
    return Array.from(unique.values()).slice(0, 8);
  }, [q, remoteResults.hashtags]);

  const goToUser = (account: SearchAccount) => {
    const params = account.origin === "mastodon" && account.mastodonId
      ? `?source=mastodon&id=${encodeURIComponent(account.mastodonId)}`
      : "";
    router.push(`/user/${encodeURIComponent(account.acct)}${params}`);
  };
  const goToPost = (post: SearchPost) =>
    router.push(post.origin === "mastodon" ? `/posts/${post.id}` : `/ChineseEVs/posts/${post.id}`);
  const goToHashtag = (name: string) => router.push(`/tag/${encodeURIComponent(name)}`);

  const hasQuery = q.length > 0;
  const hasResults = hashtags.length > 0 || users.length > 0 || posts.length > 0;

  return (
    <Box>
      <Paper withBorder p="md" mb="lg" style={{ ...CARD_STYLE }}>
        <TextInput
          placeholder="Search hashtags, people, and posts"
          variant="unstyled"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          aria-label="Search hashtags, people, and posts"
          leftSection={<IconSearch style={{ width: rem(16), height: rem(16) }} />}
          rightSection={remoteLoading ? <Loader size={14} /> : undefined}
        />
      </Paper>

      {hydrated && (
        <>
          {!hasQuery && (
            <Box mb="lg">
              <SectionTitle>Explore conversations</SectionTitle>
              <Stack gap="sm">
                {hashtags.map((tag) => (
                  <HashtagResult key={tag.name} tag={tag} onOpen={goToHashtag} />
                ))}
              </Stack>
            </Box>
          )}

          {hasQuery && !hasResults && !remoteLoading && (
            <Text size="sm" c="dimmed" px="xs">
              No results for &ldquo;{q}&rdquo;
            </Text>
          )}

          {hasQuery && remoteError && (
            <Text size="xs" c="dimmed" px="xs" mb="md" role="status">
              Server search is unavailable. Showing results saved in this app.
            </Text>
          )}

          {hasQuery && hashtags.length > 0 && (
            <Box mb="lg">
              <SectionTitle>Hashtags</SectionTitle>
              <Stack gap="sm">
                {hashtags.map((tag) => (
                  <HashtagResult key={tag.name} tag={tag} onOpen={goToHashtag} />
                ))}
              </Stack>
            </Box>
          )}

          {hasQuery && users.length > 0 && (
            <Box mb="lg">
              <SectionTitle>People</SectionTitle>
              <Stack gap="sm">
                {users.map((account) => (
                  <UnstyledButton
                    key={`${account.origin}:${account.acct}`}
                    onClick={() => goToUser(account)}
                    style={{ width: "100%" }}
                    data-search-origin={account.origin}
                  >
                    <Paper withBorder p="md" style={{ ...CARD_STYLE }}>
                      <Group gap="sm" wrap="nowrap">
                        <Avatar src={account.avatar} radius="xl" size="md" />
                        <div style={{ minWidth: 0 }}>
                          <Text size="sm" fw={600} truncate>{account.display_name}</Text>
                          <Text size="xs" c="dimmed" truncate>@{account.acct}</Text>
                        </div>
                      </Group>
                    </Paper>
                  </UnstyledButton>
                ))}
              </Stack>
            </Box>
          )}

          {hasQuery && posts.length > 0 && (
            <Box mb="lg">
              <SectionTitle>Posts</SectionTitle>
              <Stack gap="sm">
                {posts.map((post) => (
                  <UnstyledButton
                    key={`${post.origin}:${post.id}`}
                    onClick={() => goToPost(post)}
                    style={{ width: "100%" }}
                    data-search-origin={post.origin}
                  >
                    <Paper withBorder p="md" style={{ ...CARD_STYLE }}>
                      <Group gap="sm" wrap="nowrap" mb={6}>
                        <Avatar src={post.account.avatar} radius="xl" size="sm" />
                        <Text size="sm" fw={600} truncate>{post.account.username}</Text>
                        <Text size="xs" c="dimmed" truncate>@{post.account.acct}</Text>
                      </Group>
                      <Text size="sm" c="#374151" lineClamp={3}>{snippet(post.content)}</Text>
                    </Paper>
                  </UnstyledButton>
                ))}
              </Stack>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

function HashtagResult({
  tag,
  onOpen,
}: {
  tag: SearchHashtag;
  onOpen: (name: string) => void;
}) {
  return (
    <UnstyledButton
      onClick={() => onOpen(tag.name)}
      style={{ width: "100%" }}
      aria-label={`Open #${tag.name} hashtag`}
    >
      <Paper withBorder p="md" style={{ ...CARD_STYLE }}>
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <Box
            aria-hidden
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              color: "#1c2b4a",
              background: "#eef3fb",
              flex: "0 0 auto",
            }}
          >
            <IconHash size={17} stroke={2} />
          </Box>
          <div>
            <Text size="sm" fw={700} c="#011445">#{tag.name}</Text>
            <Text size="xs" c="dimmed" mt={3}>{tag.description}</Text>
          </div>
        </Group>
      </Paper>
    </UnstyledButton>
  );
}
