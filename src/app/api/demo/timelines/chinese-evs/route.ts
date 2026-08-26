import { NextRequest, NextResponse } from "next/server";
import mockData from "../../../../FakeData/listy-injection.json";
import type { ListyInjectionData } from "../../../../../types/PostType";
import { withContextualAiRewrites } from "../../../../../data/contextualAiRewrites";
import { paginateByCursor } from "../../../../../utils/cursorPagination.mjs";

export const dynamic = "force-dynamic";

const entries = (mockData as unknown as ListyInjectionData)
  .filter((entry) => entry.timelineRoot !== false)
  .map(withContextualAiRewrites);
const DEFAULT_PAGE_SIZE = 2;
const MAX_PAGE_SIZE = 10;

const stats = {
  posts: entries.length,
  responses: entries.reduce((sum, entry) => sum + entry.relatedPosts.length, 0),
  participants: new Set(
    entries.flatMap((entry) => entry.relatedPosts.map((post) => post.account.acct)),
  ).size,
};

function simulatedDelay(cursor: string | null): number {
  const configured = Number(process.env.DEMO_API_DELAY_MS);
  if (Number.isFinite(configured) && configured >= 0) return Math.min(configured, 5_000);
  const jitterSeed = cursor ? cursor.charCodeAt(cursor.length - 1) : 17;
  return 320 + (jitterSeed % 5) * 55;
}

export async function GET(request: NextRequest) {
  const cursor = request.nextUrl.searchParams.get("cursor");
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? DEFAULT_PAGE_SIZE);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(requestedLimit)))
    : DEFAULT_PAGE_SIZE;
  const delayMs = simulatedDelay(cursor);

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
          delayMs,
          generatedAt: new Date().toISOString(),
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Stacky-Data-Source": "simulated-backend",
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
