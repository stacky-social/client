import { NextRequest, NextResponse } from "next/server";
import { withContextualAiRewrites } from "../data/contextualAiRewrites";
import { getDemoCorpus } from "../data/demoCorpora";
import { paginateByCursor } from "../utils/cursorPagination.mjs";

const DEFAULT_PAGE_SIZE = 2;
const MAX_PAGE_SIZE = 10;

function simulatedDelay(cursor: string | null): number {
  const configured = Number(process.env.DEMO_API_DELAY_MS);
  if (Number.isFinite(configured) && configured >= 0) return Math.min(configured, 5_000);
  const jitterSeed = cursor ? cursor.charCodeAt(cursor.length - 1) : 17;
  return 320 + (jitterSeed % 5) * 55;
}

/** Shared topic-isolated implementation for the bundled demo timeline routes. */
export async function demoTimelineResponse(
  request: NextRequest,
  topicId: string,
): Promise<NextResponse> {
  const corpus = getDemoCorpus(topicId);
  if (!corpus) {
    return NextResponse.json(
      { error: `Unknown demo topic: ${topicId}` },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const entries = corpus.entries
    .filter((entry) => entry.timelineRoot !== false)
    .map(withContextualAiRewrites);
  const cursor = request.nextUrl.searchParams.get("cursor");
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? DEFAULT_PAGE_SIZE);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(requestedLimit)))
    : DEFAULT_PAGE_SIZE;
  const delayMs = simulatedDelay(cursor);
  const stats = {
    posts: entries.length,
    responses: entries.reduce((sum, entry) => sum + entry.relatedPosts.length, 0),
    participants: new Set(
      entries.flatMap((entry) => entry.relatedPosts.map((post) => post.account.acct)),
    ).size,
  };

  await new Promise((resolve) => setTimeout(resolve, delayMs));

  try {
    const page = paginateByCursor(entries, {
      cursor,
      limit,
      idOf: (entry) => entry.focusPost.id,
    });

    return NextResponse.json(
      {
        ...page,
        stats,
        meta: {
          simulated: true,
          topicId: corpus.id,
          delayMs,
          generatedAt: new Date().toISOString(),
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Stacky-Data-Source": "simulated-backend",
          "X-Stacky-Demo-Topic": corpus.id,
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid pagination request" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
