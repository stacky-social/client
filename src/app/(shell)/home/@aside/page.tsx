"use client";
import RelatedStacks from "../../../../components/RelatedStacks";
import { usePathname } from 'next/navigation';
import { useRelatedStacks } from "../../related-stacks-context";

export default function HomeAside() {
    const { relatedStacks, activePostId, showUpdate } = useRelatedStacks();

    // No focused post / no related stacks to show: render nothing so the shell
    // collapses to a single centered column instead of an empty aside (the shell
    // detects an aside by counting this slot's child elements).
    if (!activePostId || relatedStacks.length === 0) {
        return null;
    }

    return (
        <div style={{ width: "100%" }}>
            <RelatedStacks relatedStacks={relatedStacks} cardWidth={"100%"} onStackClick={() => {}} showupdate={showUpdate} />
        </div>
    );
}
