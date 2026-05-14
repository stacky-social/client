"use client";
import { useParams } from "next/navigation";
import RelatedStacks from "../../../../../components/RelatedStacks";
import { useRelatedStacks } from "../../../related-stacks-context";

export default function PostAside() {
    const { relatedStacks, activePostId, showUpdate } = useRelatedStacks();
    const params = useParams();
    // H5: pass focus post ID so RelatedStacks can append ?from= on related-post navigation
    const focusPostId = typeof params?.id === "string" ? params.id : undefined;

    // No focus post — aside has nothing to anchor against.
    if (!activePostId && !focusPostId) return null;

    // Focus post known but no related stacks — render an empty state instead
    // of dropping the entire aside, so the user knows the click registered.
    if (!relatedStacks || relatedStacks.length === 0) {
        return (
            <div
                style={{ width: "100%", paddingTop: "0.5rem" }}
                role="status"
                aria-live="polite"
            >
                <div style={{ padding: "1rem 0" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 6 }}>
                        Related responses
                    </div>
                    <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.45 }}>
                        No related posts found for this thread yet.
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={{ width: "100%" }}>
            <RelatedStacks
                relatedStacks={relatedStacks}
                cardWidth={"100%"}
                onStackClick={() => {}}
                showupdate={showUpdate}
                sourcePostId={focusPostId}
            />
        </div>
    );
}
