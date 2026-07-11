import React from "react";
import { Text, Paper, Loader, Group, Avatar } from "@mantine/core";
import { pickAvatarForText } from "../../utils/sentimentAvatar";
import type { ComposerFeedbackData } from "../../app/(shell)/related-stacks-context";

// Vertical rhythm of the simulated-reply thread. Each row draws its own
// connector segment spanning the gap above it down to its avatar center, so
// the segments chain into one continuous line from the draft/feedback down to
// the last simulated reply — same visual language as ThreadedReplyList's
// .threadLine (2px, #cbd5e1, centered under the avatar column).
const SIM_ROW_GAP = 10;
const AVATAR_SIZE = 38; // Mantine Avatar default (size "md")

/** One simulated reply, formatted like an actual reply: robot avatar (the
 *  colored Stacky faces double as the AI disclosure), "Possible Reply" as the
 *  author name, a SIMULATED chip, and post-sized text. */
function SimulatedReply({ content }: { content: string }) {
  return (
    <div style={{ position: "relative", marginTop: SIM_ROW_GAP }}>
      <div
        aria-hidden
        data-testid="sim-reply-connector"
        style={{
          position: "absolute",
          left: AVATAR_SIZE / 2 - 1,
          top: -SIM_ROW_GAP,
          height: SIM_ROW_GAP + AVATAR_SIZE / 2,
          width: 2,
          background: "#cbd5e1",
          zIndex: 0,
        }}
      />
      <Group gap={10} align="flex-start" wrap="nowrap" style={{ position: "relative", zIndex: 1 }}>
        <Avatar
          src={pickAvatarForText(content)}
          alt="Simulated reply"
          radius="xl"
          style={{ flexShrink: 0, backgroundColor: "#fff" }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Group gap={8} align="center" wrap="nowrap">
            <Text fw={700} size="sm" c="#011445" style={{ whiteSpace: "nowrap" }}>
              Possible Reply
            </Text>
            <Text
              component="span"
              style={{
                marginLeft: "auto",
                fontSize: 9,
                letterSpacing: 0.5,
                fontWeight: 600,
                textTransform: "uppercase",
                color: "#94a3b8",
                border: "1px solid #cbd5e1",
                borderRadius: 999,
                padding: "1px 7px",
                flexShrink: 0,
              }}
            >
              Simulated
            </Text>
          </Group>
          <Text size="md" c="#374151" style={{ lineHeight: 1.45 }}>
            {content}
          </Text>
        </div>
      </Group>
    </div>
  );
}

/**
 * Shared presentation for live draft feedback — used inline under the reply
 * composer (ReplySection) and in the home/feed aside slot (ComposerFeedback).
 *
 * Praise and advice render as ONE comment in ONE box, praise first: leading
 * with the praise is a rhetorical strategy that softens the reader up for the
 * critique — splitting them into separate boxes stopped reading as the
 * thoughts of a single person. Text is post-sized (md), not caption-sized.
 */
export function FeedbackBlock({
  loading,
  praise,
  advice,
  simulatedReplies,
}: {
  loading?: boolean;
  praise?: string | null;
  advice?: string | null;
  simulatedReplies?: Array<{ id?: string; content: string }> | null;
}) {
  const replies = simulatedReplies ?? [];
  return (
    <>
      <Text size="sm" fw={700} c="#374151" mb={6}>
        Feedback
      </Text>

      {loading ? (
        <Group gap={8} mb={8}>
          <Loader size="xs" />
          <Text size="xs" c="dimmed">Analyzing your draft…</Text>
        </Group>
      ) : (
        <>
          {(praise || advice) && (
            <Paper withBorder p="sm" radius="md" data-testid="feedback-comment" style={{ background: "#fff" }}>
              {praise && (
                <Text size="md" c="#374151" style={{ lineHeight: 1.45 }}>{praise}</Text>
              )}
              {advice && (
                <Text size="md" c="#374151" mt={praise ? 6 : 0} style={{ lineHeight: 1.45 }}>{advice}</Text>
              )}
            </Paper>
          )}

          {replies.length > 0 && (
            <div>
              {replies.map((r, i) => (
                <SimulatedReply key={r.id ?? i} content={r.content} />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

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
      <FeedbackBlock loading={loading} praise={praise} advice={advice} simulatedReplies={simulatedReplies} />
      {!loading && empty && (
        <Text size="xs" c="dimmed">Keep typing for feedback…</Text>
      )}
    </div>
  );
}

export default ComposerFeedback;
