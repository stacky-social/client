"use client";
import RelatedStacks from "../../../../../components/RelatedStacks";
import { useRelatedStacks } from "../../../related-stacks-context";

export default function PostAside() {
    const { relatedStacks, showUpdate } = useRelatedStacks();
    if (!relatedStacks || relatedStacks.length === 0) return null;
    return (
        <div style={{ width: "100%" }}>
            <RelatedStacks relatedStacks={relatedStacks} cardWidth={"100%"} onStackClick={() => {}} showupdate={showUpdate} />
        </div>
    );
}