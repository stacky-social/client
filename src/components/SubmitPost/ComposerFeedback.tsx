import React from "react";
import { Text, Paper, Loader, Group, Stack } from "@mantine/core";
import type { ComposerFeedbackData } from "../../app/(shell)/related-stacks-context";

/**
 * Aside panel that shows live writing feedback for the post being drafted in the
 * composer. Data comes from the same backend that powers comment-draft feedback
 * (POST /posts/feedback), published into the related-stacks context by SubmitPost
 * and rendered here in the home/feed aside slot. Returns null when there's none.
 */
export function ComposerFeedback({ feedback }: { feedback: ComposerFeedbackData | null }) {
  if (!feedback) return null;
  const { loading, advice, praise, simulatedReplies } = feedback;
  const empty = !advice && !praise && (!simulatedReplies || simulatedReplies.length === 0);

  return (
    <div style={{ width: "100%", paddingTop: "0.5rem" }} role="status" aria-live="polite">
      <Text size="sm" fw={700} c="#374151" mb={8}>
        Writing feedback
      </Text>

      {loading && (
        <Group gap={8} mb={8}>
          <Loader size="xs" />
          <Text size="xs" c="dimmed">Analyzing your draft…</Text>
        </Group>
      )}

      {praise && (
        <Paper withBorder p="sm" radius="md" mb={8} style={{ background: "#f0fdf4", borderColor: "#bbf7d0" }}>
          <Text size="xs" c="#15803d">{praise}</Text>
        </Paper>
      )}

      {advice && (
        <Paper withBorder p="sm" radius="md" mb={8} style={{ background: "#fff" }}>
          <Text size="xs" c="#374151">{advice}</Text>
        </Paper>
      )}

      {simulatedReplies && simulatedReplies.length > 0 && (
        <>
          <Text size="xs" c="dimmed" fw={600} mt={8} mb={6} tt="uppercase">
            How people might reply
          </Text>
          <Stack gap={6}>
            {simulatedReplies.map((r, i) => (
              <Paper key={r.id ?? i} withBorder p="sm" radius="md" style={{ background: "#fff" }}>
                <Text size="xs" c="#374151">{r.content}</Text>
              </Paper>
            ))}
          </Stack>
        </>
      )}

      {!loading && empty && (
        <Text size="xs" c="dimmed">Keep typing for feedback…</Text>
      )}
    </div>
  );
}

export default ComposerFeedback;
