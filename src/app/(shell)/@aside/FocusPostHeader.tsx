"use client";

import { Paper, Text, Group, ActionIcon } from "@mantine/core";
import { IconX } from "@tabler/icons-react";
import { getMockPost } from "../../../utils/mockPostResolver";
import { getPost } from "../../../utils/localStore";

/**
 * Small header shown above the related-responses panel that names the focus post
 * the panel is for (author + snippet) and offers a clear (×) button. Makes it
 * obvious *what* the related panel relates to and lets the user dismiss it;
 * clicking a different feed post switches the focus.
 */
export function FocusPostHeader({ postId, onClear }: { postId: string; onClear: () => void }) {
  const post: any = getMockPost(postId) ?? getPost(postId);
  if (!post) return null;

  const acc = post.account ?? {};
  const author = acc.username || acc.display_name || acc.acct || "this post";
  const snippet = String(post.content || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);

  return (
    <Paper withBorder p="xs" radius="md" mb={10} style={{ background: "#fff" }}>
      <Group justify="space-between" wrap="nowrap" gap={6} align="flex-start">
        <div style={{ minWidth: 0 }}>
          <Text size="xs" c="dimmed" fw={700} tt="uppercase">Related to</Text>
          <Text size="sm" fw={700} c="#1c2b4a">{author}</Text>
          {snippet && (
            <Text size="xs" c="#64748b" lineClamp={2}>{snippet}…</Text>
          )}
        </div>
        <ActionIcon variant="subtle" color="gray" size="sm" aria-label="Clear focus post" onClick={onClear}>
          <IconX size={16} />
        </ActionIcon>
      </Group>
    </Paper>
  );
}

export default FocusPostHeader;
