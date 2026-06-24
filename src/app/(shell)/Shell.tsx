"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { HoverTooltip } from "../../components/HoverTooltip";
import { TopNav, TOP_NAV_HEIGHT } from "../../components/NavBar/TopNav";
import { RelatedStacksProvider } from "./related-stacks-context";
import { ResizableDivider } from "./ResizableDivider";
import { useFeedRatio } from "./useFeedRatio";

/**
 * Max width of the centered (feed + related) group on wide screens — ~13in,
 * sized for comfortable eyes-only reading without head rotation (R-RESIZE-6).
 * CSS physical `in` is unreliable across displays, so this approximates it in px.
 */
const MAX_CONTENT_WIDTH = 1280;
const SLIDER_W = 8;

export default function Shell({
    children,
    aside,
}: {
    children: React.ReactNode;
    aside: React.ReactNode;
}) {
    const { ratio, setRatio, reset } = useFeedRatio();

    const groupRef = useRef<HTMLDivElement | null>(null);
    // Live width of the group minus the slider, so px drag-deltas map to ratio.
    const groupInnerRef = useRef<number>(1);
    const asideRef = useRef<HTMLDivElement | null>(null);
    const [hasAside, setHasAside] = useState(false);

    // Measure the content group for the slider's px → ratio conversion.
    useEffect(() => {
        const el = groupRef.current;
        if (!el) return;
        const measure = () => {
            groupInnerRef.current = Math.max(1, el.clientWidth - SLIDER_W);
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Detect whether the aside slot actually renders content. The parallel
    // route returns null when no post is focused (home/search/etc.); in that
    // case we collapse to a single centered column.
    useLayoutEffect(() => {
        const el = asideRef.current;
        if (!el) return;
        const update = () => setHasAside(el.childElementCount > 0);
        update();
        const mo = new MutationObserver(update);
        mo.observe(el, { childList: true });
        return () => mo.disconnect();
    }, []);

    const onSliderResize = (deltaPx: number) => {
        const inner = groupInnerRef.current || 1;
        setRatio((prev) => prev + deltaPx / inner);
    };

    return (
        <RelatedStacksProvider>
            <TopNav />

            <div
                data-testid="content-group"
                ref={groupRef}
                style={{
                    maxWidth: MAX_CONTENT_WIDTH,
                    width: "100%",
                    margin: "0 auto",
                    padding: "0 16px",
                    boxSizing: "border-box",
                    display: "flex",
                    alignItems: "stretch",
                }}
            >
                <div
                    data-testid="feed"
                    style={{
                        flexGrow: hasAside ? ratio : 1,
                        flexBasis: 0,
                        minWidth: 0,
                        paddingTop: 16,
                    }}
                >
                    {children}
                </div>

                {hasAside && (
                    <ResizableDivider
                        ariaLabel="Resize feed and related panels"
                        onResize={onSliderResize}
                        onDoubleClick={reset}
                        style={{
                            position: "relative",
                            top: "auto",
                            bottom: "auto",
                            marginLeft: 0,
                            alignSelf: "stretch",
                            flex: `0 0 ${SLIDER_W}px`,
                        }}
                    />
                )}

                <div
                    data-testid="col-aside"
                    ref={asideRef}
                    style={{
                        flexGrow: hasAside ? 1 - ratio : 0,
                        flexBasis: 0,
                        minWidth: 0,
                        display: hasAside ? "block" : "none",
                        alignSelf: "flex-start",
                        position: "sticky",
                        top: TOP_NAV_HEIGHT,
                        height: `calc(100vh - ${TOP_NAV_HEIGHT}px)`,
                        overflowY: "auto",
                        overscrollBehavior: "contain",
                        scrollbarWidth: "none",
                        // No paddingTop: the RelatedStacks header is `position:sticky;
                        // top:0`, so any top padding on this scroll container leaves a
                        // transparent strip above the header that scrolled cards show
                        // through. An opaque background keeps the panel solid.
                        background: "#FCFBF5",
                        // Container-query context: related cards detect a narrow panel
                        // (its width depends on the slider ratio, not just the viewport).
                        containerType: "inline-size",
                    }}
                >
                    {aside ?? null}
                </div>
            </div>

            <HoverTooltip />
        </RelatedStacksProvider>
    );
}
