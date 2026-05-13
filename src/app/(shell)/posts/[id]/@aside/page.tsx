"use client";
import { useParams } from "next/navigation";
import RelatedStacks from "../../../../../components/RelatedStacks";
import { useRelatedStacks } from "../../../related-stacks-context";

export default function PostAside() {
    const { relatedStacks, showUpdate } = useRelatedStacks();
    const params = useParams();
    // H5: pass focus post ID so RelatedStacks can append ?from= on related-post navigation
    const focusPostId = typeof params?.id === "string" ? params.id : undefined;
    if (!relatedStacks || relatedStacks.length === 0) return null;
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
