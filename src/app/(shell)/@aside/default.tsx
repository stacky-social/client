"use client";
import { usePathname } from 'next/navigation';
import RelatedStacks from "../../../components/RelatedStacks";
import { useRelatedStacks } from "../related-stacks-context";

export default function DefaultAside() {
    const pathname = usePathname();
    const { relatedStacks, showUpdate } = useRelatedStacks();

    const isHome = pathname === '/home' || pathname === '/';
    const isPost = pathname.startsWith('/posts/');

    if ((!isHome && !isPost) || !relatedStacks || relatedStacks.length === 0) return null;

    return (
        <div style={{ width: "100%" }}>
            <RelatedStacks relatedStacks={relatedStacks} cardWidth={"100%"} onStackClick={() => {}} showupdate={showUpdate} />
        </div>
    );
}