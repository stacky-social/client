import chineseEvsFixture from "../app/FakeData/chinese-evs.json";
import scaleDemoFixture from "../app/FakeData/scale-demo.json";
import type { ListyInjectionEntry } from "../types/PostType";

export const SCALE_DEMO_TOPIC_IDS = ["ai-workforce", "energy-tech"] as const;
export type ScaleDemoTopicId = (typeof SCALE_DEMO_TOPIC_IDS)[number];
export const DEMO_TOPIC_IDS = ["chinese-evs", ...SCALE_DEMO_TOPIC_IDS] as const;
export type DemoTopicId = (typeof DEMO_TOPIC_IDS)[number];
export type DemoCorpusEntry = Omit<ListyInjectionEntry, "topicId"> & {
  topicId: DemoTopicId;
};

export interface DemoCorpus {
  id: DemoTopicId;
  hashtag: "ChineseEVs" | "AIWorkforce" | "EnergyTech";
  label: string;
  description: string;
  routeBase: "/ChineseEVs" | "/AIWorkforce" | "/EnergyTech";
  entries: DemoCorpusEntry[];
}

function entriesFor(
  fixture: unknown,
  topicId: DemoTopicId,
): DemoCorpusEntry[] {
  if (!Array.isArray(fixture)) throw new Error(`Demo corpus ${topicId} is not an array`);
  return (fixture as ListyInjectionEntry[]).map((entry) => ({
    ...entry,
    // Older committed fixtures predate topicId. Stamp the registry's identity
    // at the boundary so every consumer receives one reliable topic contract.
    topicId,
  }));
}

function scaleEntries(fixture: unknown): DemoCorpusEntry[] {
  if (!Array.isArray(fixture)) throw new Error("Scale-demo corpus is not an array");
  return (fixture as ListyInjectionEntry[]).map((entry) => {
    const topicId = entry.topicId;
    if (!topicId || !(SCALE_DEMO_TOPIC_IDS as readonly string[]).includes(topicId)) {
      throw new Error(`Unknown scale-demo topic ${String(topicId)}`);
    }
    return { ...entry, topicId: topicId as ScaleDemoTopicId };
  });
}

/** Corrected multi-topic corpus. This intentionally excludes legacy fixtures. */
export const scaleDemoEntries: DemoCorpusEntry[] = scaleEntries(scaleDemoFixture);

/** Actual feed roots from the corrected corpus, across every prepared topic. */
export const scaleDemoTimelineEntries: DemoCorpusEntry[] = scaleDemoEntries.filter(
  (entry) => entry.timelineRoot === true,
);

export function getScaleDemoTimelineEntries(): DemoCorpusEntry[] {
  return scaleDemoTimelineEntries;
}

const scaleEntriesByTopic = new Map<ScaleDemoTopicId, DemoCorpusEntry[]>(
  SCALE_DEMO_TOPIC_IDS.map((topicId) => [
    topicId,
    scaleDemoEntries.filter((entry) => entry.topicId === topicId),
  ]),
);

export const DEMO_CORPORA: Readonly<Record<DemoTopicId, DemoCorpus>> = {
  "chinese-evs": {
    id: "chinese-evs",
    hashtag: "ChineseEVs",
    label: "Chinese EVs",
    description: "Electric vehicles, batteries, manufacturing, and industrial policy",
    routeBase: "/ChineseEVs",
    entries: entriesFor(chineseEvsFixture, "chinese-evs"),
  },
  "ai-workforce": {
    id: "ai-workforce",
    hashtag: "AIWorkforce",
    label: "AI and the workforce",
    description: "AI, jobs, worker transitions, automation, and economic policy",
    routeBase: "/AIWorkforce",
    entries: scaleEntriesByTopic.get("ai-workforce") ?? [],
  },
  "energy-tech": {
    id: "energy-tech",
    hashtag: "EnergyTech",
    label: "Energy and technology",
    description: "Electric vehicles, clean energy, power grids, and industrial competition",
    routeBase: "/EnergyTech",
    entries: scaleEntriesByTopic.get("energy-tech") ?? [],
  },
};

export const allDemoEntries: DemoCorpusEntry[] = [
  ...DEMO_CORPORA["chinese-evs"].entries,
  ...scaleDemoEntries,
];

const corpusByHashtag = new Map(
  DEMO_TOPIC_IDS.map((topicId) => [
    DEMO_CORPORA[topicId].hashtag.toLowerCase(),
    DEMO_CORPORA[topicId],
  ]),
);
const topicByPostId = new Map<string, DemoTopicId>();

function registerPostId(postId: string | null | undefined, topicId: DemoTopicId): void {
  if (!postId) return;
  const existing = topicByPostId.get(postId);
  if (existing && existing !== topicId) {
    throw new Error(`Demo post id ${postId} belongs to both ${existing} and ${topicId}`);
  }
  topicByPostId.set(postId, topicId);
}

for (const topicId of DEMO_TOPIC_IDS) {
  for (const entry of DEMO_CORPORA[topicId].entries) {
    registerPostId(entry.focusPost.id, topicId);
    for (const post of entry.ancestors ?? []) registerPostId(post.id, topicId);
    for (const post of entry.replies ?? []) registerPostId(post.id, topicId);
    for (const post of entry.relatedPosts ?? []) registerPostId(post.id, topicId);
    registerPostId(entry.focusPost.quotedPost?.id, topicId);
  }
}

export function isDemoTopicId(value: string): value is DemoTopicId {
  return (DEMO_TOPIC_IDS as readonly string[]).includes(value);
}

export function getDemoCorpus(topicId: string): DemoCorpus | undefined {
  const normalized = topicId.trim().toLowerCase();
  return isDemoTopicId(normalized) ? DEMO_CORPORA[normalized] : undefined;
}

export function getDemoCorpusByHashtag(hashtag: string): DemoCorpus | undefined {
  return corpusByHashtag.get(hashtag.trim().replace(/^#/, "").toLowerCase());
}

export function demoTopicForPost(postId: string): DemoTopicId | undefined {
  return topicByPostId.get(postId);
}

/** Topic-aware local detail URL; null means the id is not corpus-backed. */
export function demoRouteForPost(postId: string): string | null {
  const topicId = demoTopicForPost(postId);
  if (!topicId) return null;
  return `${DEMO_CORPORA[topicId].routeBase}/posts/${encodeURIComponent(postId)}`;
}
