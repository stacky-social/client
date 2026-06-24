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
} from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import {
  searchAccounts,
  searchPosts,
  useHydrated,
  type Account,
  type Post,
} from "../../utils/localStore";

/** Strip HTML tags and collapse whitespace for a plain-text snippet. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/** Truncate a string to `max` characters with an ellipsis. */
function snippet(text: string, max = 140): string {
  const clean = stripHtml(text);
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean;
}

const CARD_STYLE: React.CSSProperties = {
  backgroundColor: "#fff",
  boxShadow: "rgba(0, 0, 0, 0.1) 0px 1px 1px",
  borderRadius: 8,
};

export default function SearchBar() {
  const router = useRouter();
  const hydrated = useHydrated();

  const [query, setQuery] = useState("");
  // Debounced copy of `query` — searches run against this.
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const q = debounced.trim();

  // Only compute results once hydrated (the store reads localStorage), so the
  // server and first client render match. Recompute when the debounced query changes.
  const users: Account[] = useMemo(
    () => (hydrated && q ? searchAccounts(q) : []),
    [hydrated, q],
  );
  const posts: Post[] = useMemo(
    () => (hydrated && q ? searchPosts(q) : []),
    [hydrated, q],
  );

  const goToUser = (acct: string) => router.push(`/user/${encodeURIComponent(acct)}`);
  const goToPost = (id: string) => router.push(`/ChineseEVs/posts/${id}`);

  const hasQuery = q.length > 0;
  const hasResults = users.length > 0 || posts.length > 0;

  return (
    <Box>
      <Paper withBorder p="md" mb="lg" style={{ ...CARD_STYLE }}>
        <TextInput
          placeholder="Search people and posts"
          variant="unstyled"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          aria-label="Search people and posts"
          leftSection={<IconSearch style={{ width: rem(16), height: rem(16) }} />}
        />
      </Paper>

      {/* Results render only after hydration so SSR and first client render match. */}
      {hydrated && (
        <>
          {!hasQuery && (
            <Text size="sm" c="dimmed" px="xs">
              Start typing to search people and posts.
            </Text>
          )}

          {hasQuery && !hasResults && (
            <Text size="sm" c="dimmed" px="xs">
              No results for &ldquo;{q}&rdquo;
            </Text>
          )}

          {hasQuery && users.length > 0 && (
            <Box mb="lg">
              <Text
                size="xs"
                fw={600}
                c="dimmed"
                mb="sm"
                px="xs"
                style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}
              >
                People
              </Text>
              <Stack gap="sm">
                {users.map((acc) => (
                  <UnstyledButton
                    key={acc.acct}
                    onClick={() => goToUser(acc.acct)}
                    style={{ width: "100%" }}
                  >
                    <Paper withBorder p="md" style={{ ...CARD_STYLE }}>
                      <Group gap="sm" wrap="nowrap">
                        <Avatar src={acc.avatar} radius="xl" size="md" />
                        <div style={{ minWidth: 0 }}>
                          <Text size="sm" fw={600} truncate>
                            {acc.display_name}
                          </Text>
                          <Text size="xs" c="dimmed" truncate>
                            @{acc.acct}
                          </Text>
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
              <Text
                size="xs"
                fw={600}
                c="dimmed"
                mb="sm"
                px="xs"
                style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}
              >
                Posts
              </Text>
              <Stack gap="sm">
                {posts.map((post) => (
                  <UnstyledButton
                    key={post.id}
                    onClick={() => goToPost(post.id)}
                    style={{ width: "100%" }}
                  >
                    <Paper withBorder p="md" style={{ ...CARD_STYLE }}>
                      <Group gap="sm" wrap="nowrap" mb={6}>
                        <Avatar src={post.account.avatar} radius="xl" size="sm" />
                        <Text size="sm" fw={600} truncate>
                          {post.account.username}
                        </Text>
                        <Text size="xs" c="dimmed" truncate>
                          @{post.account.acct}
                        </Text>
                      </Group>
                      <Text size="sm" c="#374151" lineClamp={3}>
                        {snippet(post.content)}
                      </Text>
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
