"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { HoverTooltip } from "../../components/HoverTooltip";
import { TopNav, TOP_NAV_HEIGHT } from "../../components/NavBar/TopNav";
import { RelatedStacksProvider } from "./related-stacks-context";
import { ResizableDivider } from "./ResizableDivider";
import { useFeedRatio } from "./useFeedRatio";
import { useHighlightStore, asideGrouping, replyGrouping } from "../../utils/highlightStore";

/**
 * Max width of the centered (feed + related) group on wide screens — ~13in,
 * sized for comfortable eyes-only reading without head rotation (R-RESIZE-6).
 * CSS physical `in` is unreliable across displays, so this approximates it in px.
 */
const MAX_CONTENT_WIDTH = 1280;
const SLIDER_W = 8;
// Horizontal footprint the grouping bracket adds to each card: a 2px rail hugging
// each side (no gutter, so the card content doesn't shift). When grouped the panel
// widens by exactly this into ITS margin — the panel's inner edge (next to the
// feed) stays put and the cards keep both their size AND their position; only the
// outer edge moves, purely to seat the two rails.
const GROUP_RAIL_FOOTPRINT = 4;

export default function Shell({
    children,
    aside,
}: {
    children: React.ReactNode;
    aside: React.ReactNode;
}) {
    const { ratio, setRatio, reset } = useFeedRatio();
    // Grouping widens whichever panel gained a wrap-around bracket into the empty
    // page margin on its side (relaxing MAX_CONTENT_WIDTH while grouped, per product
    // decision) so that panel's cards keep their width and the rails have room. Read
    // the global topic-interaction store directly (Shell owns the layout).
    const { topicInteraction } = useHighlightStore();

    const groupRef = useRef<HTMLDivElement | null>(null);
    // Live width of the group minus the slider, so px drag-deltas map to ratio.
    const groupInnerRef = useRef<number>(1);
    const asideRef = useRef<HTMLDivElement | null>(null);
    const [hasAside, setHasAside] = useState(false);
    // Viewport width (excl. scrollbar) — drives how far the grouped aside reaches.
    const [viewportW, setViewportW] = useState(MAX_CONTENT_WIDTH);
    useEffect(() => {
        const measure = () => setViewportW(document.documentElement.clientWidth);
        measure();
        window.addEventListener("resize", measure);
        return () => window.removeEventListener("resize", measure);
    }, []);

    // Which panel is grouped decides which side of the group widens: aside grouping
    // grows the group RIGHT into the right margin (feed frozen); a reply cluster
    // grows it LEFT into the left margin (aside frozen). Mutually exclusive — one
    // topicInteraction, keyed by origin.
    const asideExpanded = hasAside && !!asideGrouping(topicInteraction);
    const feedExpanded = hasAside && !!replyGrouping(topicInteraction);
    const anyExpanded = asideExpanded || feedExpanded;

    // Freeze each column's NORMAL width (measured while neither panel is expanded)
    // so the GROWING side absorbs the whole rail footprint and the frozen side
    // never moves or reflows. Measured, not computed, to match the layout exactly.
    const feedRef = useRef<HTMLDivElement | null>(null);
    const [frozenFeedW, setFrozenFeedW] = useState<number | null>(null);
    const [frozenAsideW, setFrozenAsideW] = useState<number | null>(null);
    useEffect(() => {
        if (anyExpanded) return; // hold the last un-expanded measurements
        const feed = feedRef.current;
        const aside = asideRef.current;
        const measure = () => {
            if (feed) setFrozenFeedW(feed.getBoundingClientRect().width);
            if (aside) setFrozenAsideW(aside.getBoundingClientRect().width);
        };
        measure();
        const ro = new ResizeObserver(measure);
        if (feed) ro.observe(feed);
        if (aside) ro.observe(aside);
        return () => ro.disconnect();
    }, [anyExpanded, hasAside, ratio, viewportW]);

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

    // The group widens by the rail footprint toward the grouped panel's side; the
    // opposite edge stays put so the frozen column never moves. `anchoredLeft` /
    // `normalRight` are the un-expanded (centered-1280) edges; clamped to the
    // viewport so a narrow screen with no margin degrades gracefully.
    const anchoredLeft = Math.max(0, (viewportW - MAX_CONTENT_WIDTH) / 2);
    const normalRight = anchoredLeft + MAX_CONTENT_WIDTH;
    const gLeft = feedExpanded ? Math.max(0, anchoredLeft - GROUP_RAIL_FOOTPRINT) : anchoredLeft;
    const gRight = asideExpanded ? Math.min(viewportW, normalRight + GROUP_RAIL_FOOTPRINT) : normalRight;
    const gWidth = gRight - gLeft;

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
                    // Grouped: place the group at its computed left edge and width
                    // (widened by the rail footprint toward the grouped side).
                    // Otherwise: the normal centered, reading-capped group.
                    ...(anyExpanded
                        ? { marginLeft: gLeft, marginRight: 0, maxWidth: "none", width: gWidth }
                        : { maxWidth: MAX_CONTENT_WIDTH, width: "100%", margin: "0 auto" }),
                    transition: "margin-left 220ms ease",
                }}
            >
                <div
                    data-testid="feed"
                    ref={feedRef}
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
                        // Aside grouped → FREEZE the feed (the aside takes the extra).
                        // Reply clustered → the feed GROWS (flex-grow:1) to absorb the
                        // left-margin space so its reply cards keep their width.
                        ...(hasAside
                            ? asideExpanded && frozenFeedW != null
                                ? { flexGrow: 0, flexShrink: 0, flexBasis: `${frozenFeedW}px`, minWidth: 0 }
                                : { flexGrow: feedExpanded ? 1 : ratio, flexBasis: 0, minWidth: 0 }
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
                        // Aside grouped → grow (absorb the widened row). Reply
                        // clustered → FREEZE at normal width (the feed grows instead).
                        // Otherwise the slider-controlled share.
                        ...(hasAside
                            ? feedExpanded && frozenAsideW != null
                                ? { flexGrow: 0, flexShrink: 0, flexBasis: `${frozenAsideW}px` }
                                : { flexGrow: asideExpanded ? 1 : 1 - ratio, flexBasis: 0 }
                            : { flexGrow: 0, flexBasis: 0 }),
                        minWidth: 0,
                        display: hasAside ? "block" : "none",
                        alignSelf: "flex-start",
                        position: "sticky",
                        top: TOP_NAV_HEIGHT,
                        height: `calc(100vh - ${TOP_NAV_HEIGHT}px)`,
                        overflowY: "auto",
                        // The related panel must never scroll horizontally — any
                        // sideways overflow just shifts text out of view. Clip it so
                        // a stray wide child (deep group indent, long URL) can't add a
                        // horizontal scrollbar.
                        overflowX: "hidden",
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
