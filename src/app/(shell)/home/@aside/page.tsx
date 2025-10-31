"use client";
import RelatedStacks from "../../../../components/RelatedStacks";
import { usePathname } from 'next/navigation';
import { useRelatedStacks } from "../../related-stacks-context";

export default function HomeAside() {
    const { relatedStacks, showUpdate } = useRelatedStacks();

    return (
        <div style={{ width: "100%" }}>
            <RelatedStacks relatedStacks={relatedStacks} cardWidth={"100%"} onStackClick={() => {}} showupdate={showUpdate} />
        </div>
    );
}