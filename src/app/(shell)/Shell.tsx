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

    useEffect(() => {
        if (!hasAside) return;
        const routeRightGutterWheel = (event: WheelEvent) => {
            const aside = asideRef.current;
            if (!aside || event.defaultPrevented || event.clientY < TOP_NAV_HEIGHT) return;

            const rect = aside.getBoundingClientRect();
            const viewportRight = document.documentElement.clientWidth;
            const inRightGutter = event.clientX >= rect.right && event.clientX <= viewportRight;
            if (!inRightGutter) return;

            const unit =
                event.deltaMode === WheelEvent.DOM_DELTA_LINE
                    ? 16
                    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
                    ? aside.clientHeight
                    : 1;
            const deltaY = event.deltaY * unit;
            if (deltaY === 0) return;

            const maxScrollTop = Math.max(0, aside.scrollHeight - aside.clientHeight);
            const nextScrollTop = Math.min(maxScrollTop, Math.max(0, aside.scrollTop + deltaY));
            if (nextScrollTop === aside.scrollTop) return;

            event.preventDefault();
            aside.scrollTop = nextScrollTop;
        };

        window.addEventListener("wheel", routeRightGutterWheel, { passive: false });
        return () => window.removeEventListener("wheel", routeRightGutterWheel);
    }, [hasAside]);

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
                    padding: "0 16px",
                    boxSizing: "border-box",
                    display: "flex",
                    alignItems: "stretch",
                    // The shell owns the stable split between panes. Grouping
                    // decorations must never resize or reposition this row; pane-local
                    // frames draw outward instead so the divider stays fixed.
                    maxWidth: MAX_CONTENT_WIDTH,
                    width: "100%",
                    margin: "0 auto",
                }}
            >
                <div
                    data-testid="feed"
                    style={{
                        paddingTop: 16,
                        // Container-query context so the shared Post card can react
                        // to the feed column's own width (set by the resize divider),
                        // not the viewport — mirrors the aside. Lets category tags on
                        // the focus/feed cards compress to icon-only when narrow.
                        containerType: "inline-size",
                        // With an aside, take the slider-controlled share of the row.
                        // Without one (home / liked / bookmarks / search), render a
                        // single centered reading column instead of a too-wide
                        // full-bleed feed — keeps the composer and posts aligned and
                        // consistent with the feed width when the aside is present.
                        ...(hasAside
                            ? { flexGrow: ratio, flexBasis: 0, minWidth: 0 }
                            : { width: "100%", maxWidth: 760, margin: "0 auto" }),
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
                    className="aside-scroll"
                    ref={asideRef}
                    style={{
                        ...(hasAside
                            ? { flexGrow: 1 - ratio, flexBasis: 0 }
                            : { flexGrow: 0, flexBasis: 0 }),
                        minWidth: 0,
                        display: hasAside ? "block" : "none",
                        alignSelf: "flex-start",
                        position: "sticky",
                        top: TOP_NAV_HEIGHT,
                        height: `calc(100vh - ${TOP_NAV_HEIGHT}px)`,
                        overflowY: "auto",
                        // Grouping frames can paint a few pixels outward to the right
                        // without participating in layout. The shell/divider stay fixed;
                        // body overflow remains hidden, so this does not create page
                        // sideways scrolling.
                        overflowX: "visible",
                        overscrollBehavior: "contain",
                        // Visible, distinctly-styled scrollbar for the related panel
                        // (Firefox here; the custom webkit style is in globals.css
                        // under .aside-scroll). Deliberately different from the
                        // system scrollbar of the feed column so they don't confuse.
                        scrollbarWidth: "thin",
                        scrollbarColor: "rgba(28,43,74,0.32) transparent",
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
