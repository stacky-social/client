import { NextRequest } from "next/server";
import { demoTimelineResponse } from "../../../../../services/demoTimelineServer";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ topic: string }> },
) {
  const { topic } = await context.params;
  return demoTimelineResponse(request, topic);
}
