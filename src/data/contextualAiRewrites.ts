import type { ListyInjectionEntry, RelatedPostMock } from "../types/PostType";

export type ContextualAiRewrite = {
  content: string;
  significant: boolean;
  editSummary?: string;
};

type RewriteInstruction = {
  from: string;
  to: string;
  editSummary: string;
};

/**
 * Demo-only examples of the contextual clarification a future enrichment
 * service can return. The key includes both posts because a response can need a
 * different clarification depending on which focus post it is paired with.
 */
const REWRITE_INSTRUCTIONS: Record<string, RewriteInstruction> = {
  "143195604:149288649": {
    from: "I am glad to see a long form article on this topic.",
    to: "On U.S. automakers falling behind China's EV industry, I am glad to see a long-form article on this topic.",
    editSummary: "Names the auto-industry context that was implicit in the original reply.",
  },
  "143200921:152047717": {
    from: "This should be framed as support for engineering work as opposed to new scientific breakthroughs.",
    to: "In response to the argument that incumbent automakers struggle with disruptive EV technology, this should be framed as support for engineering work rather than new scientific breakthroughs.",
    editSummary: "Connects the engineering argument to the focus post's disruption theme.",
  },
  "149289024:149289332": {
    from: "Watch YouTube videos on China's new EVs, or the top 10 EVs in China. It's mind-blowing.",
    to: "For evidence that the future auto market is electric and software-driven, watch YouTube videos on China's new EVs, or the top 10 EVs in China. It's mind-blowing.",
    editSummary: "Makes the evidence-to-claim connection explicit.",
  },
  "149289030:152047229": {
    from: "One reads this and sees decades of American foolishness and greed leading to our fall from top tier research and manufacturing.",
    to: "Seen through the lens of short-term Wall Street incentives, one reads this and sees decades of American foolishness and greed leading to our fall from top-tier research and manufacturing.",
    editSummary: "Adds the short-term incentive frame supplied by the focus post.",
  },
  "152047717:152053690": {
    from: "I reported this story when I was in China for President Trump's visit in May.",
    to: "As a concrete example of engineering progress in batteries, I reported this story when I was in China for President Trump's visit in May.",
    editSummary: "Clarifies why the first-hand report supports the engineering claim.",
  },
  "152053690:143196877": {
    from: "I work in sustainability for a leading European global brand that has 1000+ suppliers across the world.",
    to: "To connect China's battery-factory lead with supply-chain practice, I work on sustainability for a major European brand that has 1000+ suppliers across the world.",
    editSummary: "Makes the supply-chain connection explicit and tightens the wording of the supporting example.",
  },
};

export function contextualAiRewrite(
  focusPostId: string,
  relatedPostId: string,
  originalContent: string,
  fallback?: RelatedPostMock["rewrite"],
): ContextualAiRewrite {
  const instruction = REWRITE_INSTRUCTIONS[`${focusPostId}:${relatedPostId}`];
  if (!instruction) {
    return {
      content: fallback?.content ?? originalContent,
      significant: fallback?.significant ?? false,
      editSummary: fallback?.editSummary,
    };
  }

  const content = originalContent.replace(instruction.from, instruction.to);
  if (content === originalContent) {
    // Fixture drift should fail safely: never claim an edit when the source
    // phrase no longer matches the curated post.
    return { content: originalContent, significant: false };
  }

  return { content, significant: true, editSummary: instruction.editSummary };
}

/** Adds backend-shaped enrichment metadata without mutating the JSON fixture. */
export function withContextualAiRewrites(entry: ListyInjectionEntry): ListyInjectionEntry {
  return {
    ...entry,
    relatedPosts: entry.relatedPosts.map((post) => ({
      ...post,
      rewrite: contextualAiRewrite(entry.focusPost.id, post.id, post.content, post.rewrite),
    })),
  };
}
